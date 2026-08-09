module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_PIN = process.env.ADMIN_PIN;

    const rolePins = {
      referee: process.env.REFEREE_PIN,
      fourth: process.env.FOURTH_OFFICIAL_PIN,
      captain: process.env.CAPTAIN_PIN
    };

    if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_PIN) {
      return res.status(500).send("Server environment is not configured");
    }

    const body = req.body || {};
    const pin = String(body.pin || "");

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    };

    // =========================
    // 역할별 로그인
    // =========================
    if (body.action === "role_login") {
      const expected = rolePins[body.role];

      if (!expected || pin !== String(expected)) {
        return res.status(401).send("Unauthorized");
      }

      return res.status(200).json({ ok: true });
    }

    // =========================
    // 역할별 기능
    // =========================
    if (body.action === "role_action") {
      const role = body.role;
      const expected = rolePins[role];

      if (!expected || pin !== String(expected)) {
        return res.status(401).send("Unauthorized");
      }

      const stateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/tournament_state?select=state&id=eq.main`,
        { headers }
      );

      if (!stateResponse.ok) {
        return res.status(500).send(await stateResponse.text());
      }

      const rows = await stateResponse.json();
      const state = rows && rows[0] && rows[0].state;

      if (!state) {
        return res.status(500).send("Missing tournament state");
      }

      const payload = body.payload || {};
      const matchId = String(payload.matchId || "");

      if (!/^M([1-9]|1[0-4])$/.test(matchId)) {
        return res.status(400).send("Invalid match");
      }

      if (!state.matches || !state.matches[matchId]) {
        return res.status(400).send("Unknown match");
      }

      const matchState = state.matches[matchId];
      const matchDef = getMatchDef(matchId);

      // =========================
      // 이벤트 추가
      // =========================
      if (body.operation === "add_event") {
        const event = Object.assign({}, payload.event || {});

        let allowed = [];

        if (role === "referee") {
          allowed = ["goal", "yellow", "red"];
        }

        if (role === "fourth") {
          allowed = ["sub"];
        }

        if (!allowed.includes(event.type)) {
          return res.status(403).send("Operation not allowed");
        }

        if (!Array.isArray(matchState.events)) {
          matchState.events = [];
        }

        // 득점
        if (event.type === "goal") {
          if (
            !matchDef ||
            ![matchDef.a, matchDef.b].includes(event.team)
          ) {
            return res.status(400).send("Invalid team");
          }

          event.player = String(event.player || "").trim();
          event.minute = String(event.minute || "").trim();
          event.pk = Boolean(event.pk);
          event.og = Boolean(event.og);

          if (!event.player) {
            return res.status(400).send("Missing player");
          }

          if (event.team === matchDef.a) {
            matchState.scoreA = Number(matchState.scoreA || 0) + 1;
          } else if (event.team === matchDef.b) {
            matchState.scoreB = Number(matchState.scoreB || 0) + 1;
          }
        }

        // 카드
        if (
          event.type === "yellow" ||
          event.type === "red"
        ) {
          event.player = String(event.player || "").trim();
          event.minute = String(event.minute || "").trim();

          if (!event.player) {
            return res.status(400).send("Missing player");
          }
        }

        // 교체
        if (event.type === "sub") {
          event.out = String(event.out || "").trim();
          event.inn = String(event.inn || "").trim();
          event.minute = String(event.minute || "").trim();

          if (!event.out || !event.inn) {
            return res.status(400).send("Missing players");
          }
        }

        matchState.events.push(event);
      }

      // =========================
      // 이벤트 삭제
      // =========================
      else if (body.operation === "delete_event") {
        const index = Number(payload.index);

        if (
          !Number.isInteger(index) ||
          index < 0 ||
          !Array.isArray(matchState.events) ||
          index >= matchState.events.length
        ) {
          return res.status(400).send("Invalid event");
        }

        const event = matchState.events[index];

        const allowed =
          role === "referee"
            ? ["goal", "yellow", "red"].includes(event.type)
            : role === "fourth"
              ? event.type === "sub"
              : false;

        if (!allowed) {
          return res.status(403).send("Operation not allowed");
        }

        if (event.type === "goal" && matchDef) {
          if (event.team === matchDef.a) {
            matchState.scoreA = Math.max(
              0,
              Number(matchState.scoreA || 0) - 1
            );
          } else if (event.team === matchDef.b) {
            matchState.scoreB = Math.max(
              0,
              Number(matchState.scoreB || 0) - 1
            );
          }
        }

        matchState.events.splice(index, 1);
      }

      // =========================
      // 주장 라인업 저장
      // =========================
      else if (body.operation === "save_lineup") {
        if (role !== "captain") {
          return res.status(403).send("Operation not allowed");
        }

        const team = String(payload.team || "");

        if (
          !matchDef ||
          ![matchDef.a, matchDef.b].includes(team)
        ) {
          return res.status(400).send("Invalid team");
        }

        if (!state.lineups) {
          state.lineups = {};
        }

        state.lineups[`${matchId}_${team}`] = {
          formation: String(
            payload.formation || "4-3-3"
          ),

          starters: Array.isArray(payload.starters)
            ? payload.starters
                .slice(0, 11)
                .map(x =>
                  String(x || "").trim()
                )
            : [],

          bench: Array.isArray(payload.bench)
            ? payload.bench
                .map(x =>
                  String(x || "").trim()
                )
                .filter(Boolean)
            : []
        };
      }

      else {
        return res
          .status(400)
          .send("Unknown operation");
      }

      // =========================
      // Supabase 저장
      // =========================
      const patchResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/tournament_state?id=eq.main`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            state,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!patchResponse.ok) {
        return res
          .status(500)
          .send(await patchResponse.text());
      }

      return res.status(200).json({
        ok: true
      });
    }

    // =========================
    // ADMIN 인증
    // =========================
    if (pin !== String(ADMIN_PIN)) {
      return res
        .status(401)
        .send("Unauthorized");
    }

    // ADMIN 로그인
    if (body.action === "login") {
      return res.status(200).json({
        ok: true
      });
    }

    // =========================
    // ADMIN 댓글 삭제
    // =========================
    if (body.action === "delete_comment") {
      const id = String(body.id || "");

      if (!/^\d+$/.test(id)) {
        return res
          .status(400)
          .send("Invalid comment id");
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/match_comments?id=eq.${id}`,
        {
          method: "DELETE",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "return=minimal"
          }
        }
      );

      if (!response.ok) {
        return res
          .status(500)
          .send(await response.text());
      }

      return res.status(200).json({
        ok: true
      });
    }

    // =========================
    // ADMIN 전체 상태 저장
    // =========================
    if (body.action === "save_state") {
      if (
        !body.state ||
        typeof body.state !== "object"
      ) {
        return res
          .status(400)
          .send("Missing state");
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/tournament_state?id=eq.main`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            state: body.state,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!response.ok) {
        return res
          .status(500)
          .send(await response.text());
      }

      return res.status(200).json({
        ok: true
      });
    }

    return res
      .status(400)
      .send("Unknown action");
  }

  catch (error) {
    console.error(
      "KSYFA API ERROR:",
      error
    );

    return res
      .status(500)
      .send(
        "KSYFA API ERROR: " +
        (
          error &&
          error.message
            ? error.message
            : String(error)
        )
      );
  }
};


// =========================
// 경기 팀 정의
// =========================
function getMatchDef(id) {
  const matches = {
    M1: {
      a: "GYEONGGI",
      b: "HANSUNG"
    },

    M2: {
      a: "SEOUL",
      b: "IASA"
    },

    M3: {
      a: "KSA",
      b: "GWANGJU"
    },

    M4: {
      a: "DAEGU",
      b: "DAEJEON"
    },

    M5: {
      a: "GYEONGGI",
      b: "GWANGJU"
    },

    M6: {
      a: "SEOUL",
      b: "DAEJEON"
    },

    M7: {
      a: "KSA",
      b: "HANSUNG"
    },

    M8: {
      a: "IASA",
      b: "DAEGU"
    },

    M9: {
      a: "GYEONGGI",
      b: "KSA"
    },

    M10: {
      a: "SEOUL",
      b: "DAEGU"
    },

    M11: {
      a: "HANSUNG",
      b: "GWANGJU"
    },

    M12: {
      a: "IASA",
      b: "DAEJEON"
    },

    M13: {
      a: null,
      b: null
    },

    M14: {
      a: null,
      b: null
    }
  };

  return matches[id];
}

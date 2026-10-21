import { getStore } from "@netlify/blobs";
import { randomUUID, timingSafeEqual } from "node:crypto";

const store = () => getStore("quiz-certificate-studio-v1");
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" }
});
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const safeId = (v) => /^[a-zA-Z0-9_-]{4,80}$/.test(String(v ?? ""));
const isAdmin = (req) => {
  const expected = process.env.QCS_ADMIN_KEY || "";
  const got = req.headers.get("x-admin-key") || "";
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
};
const readJSON = async (s, key) => {
  try { return await s.get(key, { type: "json", consistency: "strong" }); } catch { return null; }
};

export default async (request) => {
  const url = new URL(request.url);
  // Netlify's rewrite may preserve /api/... or expose the function path; support both.
  let path = url.pathname.replace(/^\/.netlify\/functions\/api/, "/api").replace(/\/$/, "");
  const s = store();

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-key", "access-control-max-age": "86400"
  }});

  try {
    if (path === "/api/health" && request.method === "GET") return json({ ok: true, service: "Quiz & Certificate Studio API" });

    if (path === "/api/quizzes" && request.method === "GET") {
      const { blobs = [] } = await s.list({ prefix: "quiz-" });
      const quizzes = [];
      for (const b of blobs) {
        const q = await readJSON(s, b.key);
        if (q && q.id) quizzes.push({ id: q.id, title: q.title, description: q.description, passing: q.passing, questionCount: q.questions?.length || 0, updatedAt: q.updatedAt });
      }
      quizzes.sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      return json({ quizzes });
    }

    if (path === "/api/quizzes" && request.method === "POST") {
      if (!isAdmin(request)) return json({ error: "Admin key गलत है या QCS_ADMIN_KEY सेट नहीं है।" }, 401);
      const body = await request.json();
      const title = clean(body.title, 120);
      const questions = Array.isArray(body.questions) ? body.questions.slice(0, 100) : [];
      if (!title) return json({ error: "Quiz का नाम जरूरी है।" }, 400);
      if (!questions.length) return json({ error: "कम-से-कम एक प्रश्न जोड़ें।" }, 400);
      const normalized = questions.map((q, i) => ({
        id: clean(q.id || `q${i+1}`, 60),
        question: clean(q.question, 1000),
        options: (Array.isArray(q.options) ? q.options : []).slice(0, 6).map(x => clean(x, 300)),
        answer: Math.max(0, Math.min((q.options?.length || 1)-1, Number(q.answer) || 0))
      })).filter(q => q.question && q.options.length >= 2);
      if (!normalized.length) return json({ error: "हर प्रश्न में कम-से-कम दो विकल्प चाहिए।" }, 400);
      const id = safeId(body.id) ? body.id : randomUUID().replaceAll("-", "").slice(0, 12);
      const previous = await readJSON(s, `quiz-${id}`);
      const quiz = {
        id, title, description: clean(body.description, 500), passing: Math.max(1, Math.min(100, Number(body.passing) || 60)),
        certificateTitle: clean(body.certificateTitle || "Certificate of Achievement", 120),
        issuer: clean(body.issuer || "Quiz & Certificate Studio", 120), questions: normalized,
        createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      await s.setJSON(`quiz-${id}`, quiz);
      return json({ ok: true, quiz: { ...quiz, questions: quiz.questions.map(({answer, ...q}) => q) } }, previous ? 200 : 201);
    }

    const getQuiz = path.match(/^\/api\/quizzes\/([\w-]+)$/);
    if (getQuiz && request.method === "GET") {
      if (!safeId(getQuiz[1])) return json({ error: "Invalid quiz ID" }, 400);
      const q = await readJSON(s, `quiz-${getQuiz[1]}`);
      if (!q) return json({ error: "Quiz नहीं मिला।" }, 404);
      return json({ quiz: { ...q, questions: isAdmin(request) ? q.questions : q.questions.map(({answer, ...item}) => item) } });
    }

    const submit = path.match(/^\/api\/submit\/([\w-]+)$/);
    if (submit && request.method === "POST") {
      const q = await readJSON(s, `quiz-${submit[1]}`);
      if (!q) return json({ error: "Quiz नहीं मिला।" }, 404);
      const body = await request.json();
      const name = clean(body.name, 100);
      if (!name) return json({ error: "अपना नाम लिखें।" }, 400);
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      let score = 0;
      q.questions.forEach((item, i) => { if (Number(answers[item.id]) === item.answer) score++; });
      const total = q.questions.length;
      const percent = Math.round((score / total) * 100);
      const passed = percent >= q.passing;
      const attemptId = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
      const result = { id: attemptId, quizId: q.id, quizTitle: q.title, name, score, total, percent, passed, createdAt: new Date().toISOString() };
      await s.setJSON(`attempt-${attemptId}`, result);
      let certificate = null;
      if (passed) {
        const certificateId = `QCS-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
        certificate = { id: certificateId, name, quizTitle: q.title, certificateTitle: q.certificateTitle, issuer: q.issuer, score, total, percent, issuedAt: new Date().toISOString() };
        await s.setJSON(`certificate-${certificateId}`, certificate);
      }
      return json({ result, certificate });
    }

    const verify = path.match(/^\/api\/verify\/([\w-]+)$/);
    if (verify && request.method === "GET") {
      const cert = await readJSON(s, `certificate-${verify[1].toUpperCase()}`);
      return cert ? json({ valid: true, certificate: cert }) : json({ valid: false, error: "यह certificate ID नहीं मिला।" }, 404);
    }

    return json({ error: "Endpoint नहीं मिला।" }, 404);
  } catch (err) {
    console.error("QCS API error", err);
    return json({ error: "Server error. Netlify function logs देखें।" }, 500);
  }
};

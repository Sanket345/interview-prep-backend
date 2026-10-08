const Groq = require("groq-sdk");
const { z } = require("zod");
const puppeteer = require("puppeteer");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// If Groq retires this model, change it here or set GROQ_MODEL in .env
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const questionSchema = z.object({
  question: z.string(),
  intention: z.string(),
  answer: z.string(),
});

const interviewReportSchema = z.object({
  matchScore: z.coerce.number().min(0).max(100),
  technicalQuestions: z.array(questionSchema),
  behavioralQuestions: z.array(questionSchema),
  skillGaps: z.array(
    z.object({
      skill: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ),
  preparationPlan: z.array(
    z.object({
      day: z.coerce.number(),
      focus: z.string(),
      tasks: z.array(z.string()),
    }),
  ),
  title: z.string(),
});

const resumePdfSchema = z.object({
  html: z.string(),
});

async function askGroqForJson(prompt, schema) {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a career coach. Reply with a single valid JSON object only. No markdown, no extra text.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const text = completion.choices[0].message.content;
  return schema.parse(JSON.parse(text));
}

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = `Generate an interview report for a candidate with the following details:
Resume: ${resume || "Not provided"}
Self Description: ${selfDescription || "Not provided"}
Job Description: ${jobDescription}

Return a JSON object with exactly this shape:
{
  "matchScore": number between 0 and 100 showing how well the candidate matches the job,
  "title": "the job title",
  "technicalQuestions": [ { "question": "...", "intention": "why the interviewer asks it", "answer": "how to answer it, points to cover" } ],
  "behavioralQuestions": [ { "question": "...", "intention": "...", "answer": "..." } ],
  "skillGaps": [ { "skill": "...", "severity": "low" | "medium" | "high" } ],
  "preparationPlan": [ { "day": 1, "focus": "...", "tasks": [ "...", "..." ] } ]
}
Include about 8 technical questions, 5 behavioral questions, and a 7 day preparation plan.`;

  return askGroqForJson(prompt, interviewReportSchema);
}

async function generatePdfFromHtml(htmlContent) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm",
    },
  });

  await browser.close();

  return pdfBuffer;
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
  const prompt = `Generate a resume for a candidate with the following details:
Resume: ${resume || "Not provided"}
Self Description: ${selfDescription || "Not provided"}
Job Description: ${jobDescription}

Return a JSON object with a single field "html" containing the full HTML of the resume, ready to be converted to PDF with puppeteer.
The resume should be tailored to the job description and highlight the candidate's strengths and relevant experience.
It should read like a real human-written resume, not AI-generated.
Keep the design simple and professional, ATS friendly, and 1-2 pages long when printed.
Use inline CSS only. Do not load external fonts, images or scripts.`;

  const jsonContent = await askGroqForJson(prompt, resumePdfSchema);

  return generatePdfFromHtml(jsonContent.html);
}

module.exports = { generateInterviewReport, generateResumePdf };

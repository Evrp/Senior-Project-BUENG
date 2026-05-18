import express from 'express';
import { getModel } from '../services/gemini.js';
import { AiChatMessage } from '../model/AiChatMessage.js';
import { InfoMatch } from '../model/infomatch.js';
import { Event } from '../model/event.js';
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS_SHORT,
  MAX_RECENT_EVENTS,
} from '../constants/index.js';
import { MessageSender, GeminiRole } from '../enums/index.js';

// Initialize Gemini AI lazily via service
const app = express.Router();

// POST /api/aichat/daily-recommendation - Generate daily event recommendations
app.post('/daily-recommendation', async (req, res) => {
  try {
    // 1. Fetch recent events (limit 20 to provide variety but save tokens)
    const events = await Event.find()
      .sort({ createdAt: -1 })
      .limit(MAX_RECENT_EVENTS)
      .select('title description date location address venue');

    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: 'No events found to recommend.' });
    }

    // 2. Prepare data for AI
    const eventList = events
      .map((e) => {
        // Format date safely
        let dateStr = 'N/A';
        if (e.date) {
          if (typeof e.date === 'object') {
            dateStr = e.date.when || e.date.start_date || JSON.stringify(e.date);
          } else {
            dateStr = String(e.date);
          }
        }

        let locationStr = e.location || 'ไม่ระบุ';
        if (Array.isArray(e.address)) locationStr = e.address.join(', ');

        return `- ID: ${e._id}, Title: ${e.title}, Date: ${dateStr}, Location: ${locationStr}`;
      })
      .join('\n');

    const systemPrompt = `
Role: BUENG AI (Event Curator)
Task: เลือกกิจกรรมที่น่าสนใจ 3 อันดับแรกจากรายการที่ให้ เพื่อแนะนำเป็น "Daily Highlights"
Output Format: JSON Object ที่มี key "recommendations" เป็น array
Constraint: เหตุผล (reason) ต้องเป็นภาษาไทยที่ดึงดูดใจและเป็นกันเอง
JSON Structure:
{ "recommendations": [{ "id": "...", "title": "...", "reason": "..." }] }`;

    const model = getModel('RECOMMENDATION', { systemInstruction: systemPrompt });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `รายการกิจกรรม:\n${eventList}\n\nกรุณาตอบกลับในรูปแบบ JSON เท่านั้น` }],
        },
      ],
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE,
        responseMimeType: 'application/json',
      },
    });

    const content = result.response.text();
    if (!content) {
      throw new Error('AI returned empty content');
    }

    const parsedResult = JSON.parse(content);
    res.status(200).json({ success: true, data: parsedResult });
  } catch (error) {
    console.error('Error generating daily recommendation:', error);
    res.status(500).json({ success: false, message: 'Error generating recommendations.' });
  }
});

// GET /api/aichat/:roomId - Fetch AI chat history for a room
app.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await AiChatMessage.find({ roomId }).sort({ timestamp: 1 });
    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching AI chat history:', error);
    res.status(500).json({ success: false, message: 'Error fetching AI chat history.' });
  }
});

// GET /api/aichat/:roomId/insight - Generate a quick insight/ice-breaker for the room
app.get('/:roomId/insight', async (req, res) => {
  try {
    const { roomId } = req.params;
    const match = await InfoMatch.findById(roomId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match context not found' });
    }

    const eventInfo = match.detail || 'กิจกรรม';
    const systemPrompt = `
Role: BUENG AI
Task: สร้างประโยคทักทายสั้นๆ หรือ Fun Fact เกี่ยวกับ "${eventInfo}" เพื่อเริ่มบทสนทนา (Ice Breaking)
Tone: สนุก, เป็นกันเอง, สั้นกระชับ (ไม่เกิน 1 ประโยค)
Language: Thai`;

    const model = getModel('INSIGHT', { systemInstruction: systemPrompt });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'สร้างประโยคทักทายหรือ Fun Fact' }],
        },
      ],
      generationConfig: {
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS_SHORT,
        temperature: 0.8,
      },
    });

    const insight = result.response.text();
    res.status(200).json({ success: true, data: insight });
  } catch (error) {
    console.error('AI Insight Error:', error);
    res.status(500).json({ success: false, message: 'Error generating insight.' });
  }
});

// POST /api/aichat/:roomId - Send a message to the AI
app.post('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, history } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid content' });
    }

    // 1. AI Logic: Generate a response
    let match = null;
    if (/^[0-9a-fA-F]{24}$/.test(roomId)) {
      match = await InfoMatch.findById(roomId);
    }

    // Prepare Date Context
    const now = new Date();
    const todayThai = now.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // RAG: Fetch recent events (fallback to createdAt because date field is Mixed/Unstructured)
    const recentEvents = await Event.find()
      .sort({ createdAt: -1 })
      // .limit(15)
      .select('title date location address venue');

    const eventsContext = recentEvents
      .map((e) => {
        let dateStr = 'N/A';
        if (e.date) {
          if (typeof e.date === 'object') {
            dateStr = e.date.when || e.date.start_date || JSON.stringify(e.date);
          } else {
            dateStr = String(e.date);
          }
        }

        let locationStr = e.location || 'ไม่ระบุ';
        if (Array.isArray(e.address)) locationStr = e.address.join(', ');
        else if (e.venue && e.venue.name) locationStr = e.venue.name;

        return `- ${e.title} (เวลา: ${dateStr}) @ ${locationStr}`;
      })
      .join('\n');

    // Modern System Prompt Engineering
    let systemContent = `
Role: คุณคือ "BUENG AI" (บึง) ผู้ช่วยอัจฉริยะประจำแอพพลิเคชัน Senior Project BUENG
Personality: เป็นมิตร, กระตือรือร้น, ทันสมัย, และมีความเข้าอกเข้าใจ (Empathy)
Language: ภาษาไทย (เป็นธรรมชาติ ไม่ทางการจนเกินไป)
Current Date: ${todayThai}

Task:
1. ช่วยเหลือผู้ใช้ในการหาเพื่อน (Matching) และหากิจกรรม (Event)
2. แนะนำหัวข้อสนทนา (Ice Breaking) หากผู้ใช้ไม่รู้จะคุยอะไร โดยอิงจากบริบทของห้อง
3. ให้ข้อมูลเกี่ยวกับกิจกรรมถ้ามีการระบุในบริบท
4. ตอบคำถามทั่วไปเกี่ยวกับการใช้งานแอพ

Constraints:
- ห้ามตอบคำถามที่ผิดกฎหมาย หรือไม่เหมาะสม
- หากไม่ทราบข้อมูล ให้ตอบตามตรงและแนะนำให้ผู้ใช้ค้นหาเพิ่มเติม
- พยายามกระชับคำตอบ ไม่เยิ่นเย้อ`;

    // Inject Real-time Event Data
    systemContent += `\n\n[ข้อมูลกิจกรรมล่าสุดในระบบ (Real-time)]\n${eventsContext}\n\nคำแนะนำ: หากผู้ใช้ถามหากิจกรรมที่น่าสนใจ ให้ใช้ข้อมูลจากรายการด้านบนนี้ในการตอบ เพื่อให้ข้อมูลเป็นปัจจุบันที่สุด`;

    if (match) {
      const eventInfo = match.detail || 'กิจกรรมทั่วไป';
      const matchStatus = match.status || 'unknown';

      systemContent += `

[Current Context Data]
- Room Context: สนทนาเกี่ยวกับ "${eventInfo}"
- Match Status: ${matchStatus}
- User Pair: ${match.email} และ ${match.usermatch}

Instruction: ใช้ข้อมูล Context นี้ในการสนทนา เช่น ถ้าเป็นห้องที่ Match กันจากกิจกรรม "${eventInfo}" ให้ชวนคุยเรื่องเกี่ยวกับกิจกรรมนั้น หรือแนะนำสิ่งที่ต้องเตรียมตัวสำหรับการไปร่วมกิจกรรม`;
    }

    // Limit history to last 10 messages to maintain focus and save tokens
    const recentHistory = Array.isArray(history)
      ? history
          .slice(-10)
          .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim() !== '')
      : [];

    // Convert history to Gemini format
    const geminiHistory = recentHistory.map((msg) => ({
      role:
        msg.role === MessageSender.ASSISTANT || msg.role === MessageSender.AI
          ? GeminiRole.MODEL
          : GeminiRole.USER,
      parts: [{ text: msg.content }],
    }));

    const model = getModel('CHAT', { systemInstruction: systemContent });

    const result = await model.generateContent({
      contents: [
        ...geminiHistory,
        {
          role: 'user',
          parts: [{ text: content }],
        },
      ],
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE, // Balance between creativity and focus
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      },
    });

    const aiResponseContent = result.response.text();

    // Log AI Chat interactions for testing and demonstrations (e.g., Data Privacy Case)
    console.log(`\n========== 💬 [AI Chat Interaction Log] ==========`);
    console.log(`[Room ID]: ${roomId}`);
    console.log(`[User Request]: "${content}"`);
    console.log(`[AI Response]: "${aiResponseContent}"`);
    console.log(`====================================================\n`);

    // 2. Save user's message
    const userMessage = new AiChatMessage({ roomId, sender: MessageSender.USER, content });
    await userMessage.save();

    // 3. Save AI's response
    const aiMessage = new AiChatMessage({
      roomId,
      sender: MessageSender.AI,
      content: aiResponseContent,
    });
    await aiMessage.save();

    // 4. Send AI's response object back to the client
    res.status(201).json({ success: true, data: aiMessage });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ success: false, message: 'Error processing AI message.' });
  }
});

// POST /api/aichat/:roomId/save - Save a pre-generated conversation
app.post('/:roomId/save', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userMessageContent, aiMessageContent } = req.body;

    // 1. Save user's message
    const userMessage = new AiChatMessage({
      roomId,
      sender: MessageSender.USER,
      content: userMessageContent,
    });
    await userMessage.save();

    // 2. Save AI's response
    const aiMessage = new AiChatMessage({
      roomId,
      sender: MessageSender.AI,
      content: aiMessageContent,
    });
    await aiMessage.save();

    res.status(201).json({ success: true, message: 'Conversation saved.' });
  } catch (error) {
    console.error('Error saving AI chat:', error);
    res.status(500).json({ success: false, message: 'Error saving AI chat.' });
  }
});

export default app;

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const $ = (id) => document.getElementById(id);
const chatBox = $("chatBox");
const userInput = $("userInput");
const apiKeyInput = $("apiKey");
const modelSelect = $("model");
const typing = $("typing");
const sendBtn = $("sendBtn");

const SYSTEM = {
    role: "system",
    content: "You are a helpful, friendly AI assistant. Give clear, well-structured answers. Use Markdown, and always put code in fenced code blocks with a language tag."
};
let messages = [SYSTEM];

/* ---------- saved settings (key stays in YOUR browser only) ---------- */
apiKeyInput.value = localStorage.getItem("groq_key") || "";
modelSelect.value = localStorage.getItem("groq_model") || modelSelect.value;
apiKeyInput.addEventListener("input", () => localStorage.setItem("groq_key", apiKeyInput.value.trim()));
modelSelect.addEventListener("change", () => localStorage.setItem("groq_model", modelSelect.value));
userInput.addEventListener("input", autoGrow);

function autoGrow() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
}

/* ---------- send ---------- */
async function sendMessage(text) {
    const message = (typeof text === "string" ? text : userInput.value).trim();
    const apiKey = apiKeyInput.value.trim();
    if (!message || sendBtn.disabled) return;

    if (!apiKey) {
        addMessage("Please paste your Groq API key in the API key box above first.", "error");
        apiKeyInput.focus();
        return;
    }

    addMessage(message, "user");
    messages.push({ role: "user", content: message });
    userInput.value = "";
    autoGrow();

    typing.style.display = "flex";
    chatBox.scrollTop = chatBox.scrollHeight;
    sendBtn.disabled = userInput.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: modelSelect.value,
                messages,
                temperature: 0.7,
                max_completion_tokens: 4096,
                stream: false
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "API request failed");

        const reply = data.choices?.[0]?.message?.content || "(The model returned an empty reply. Try again.)";
        messages.push({ role: "assistant", content: reply });
        addMessage(reply, "bot");
    } catch (error) {
        addMessage("Error: " + error.message, "error");
        messages.pop();
    } finally {
        typing.style.display = "none";
        sendBtn.disabled = userInput.disabled = false;
        userInput.focus();
    }
}

/* ---------- messages ---------- */
function addMessage(text, sender) {
    const el = document.createElement("div");
    el.className = "message " + sender;
    el.dataset.who = sender === "user" ? "YOU" : sender === "error" ? "ERROR" : "AI";

    if (sender === "bot") {
        el._raw = text;
        el.innerHTML = render(text) +
            `<div class="msg-actions"><button class="mini" data-act="copymsg">Copy reply</button></div>`;
    } else {
        el.textContent = text;
    }
    chatBox.appendChild(el);
    chatBox.scrollTop = chatBox.scrollHeight;
    return el;
}

function showWelcome() {
    const el = document.createElement("div");
    el.className = "message bot";
    el.dataset.who = "AI";
    el.innerHTML = `<p>Hello! \u{1F44B} I'm your AI assistant powered by Groq. Ask me anything, and I'll format answers and code nicely.</p>
        <div class="chips">
            <button class="chip" data-act="chip" data-p="Write a Python function to check if a number is prime">Python prime check</button>
            <button class="chip" data-act="chip" data-p="Explain how async/await works in JavaScript with an example">Explain async/await</button>
            <button class="chip" data-act="chip" data-p="Give me a 5-step plan to learn web development">Learning plan</button>
        </div>`;
    chatBox.appendChild(el);
}

function handleEnter(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function clearChat() {
    messages = [SYSTEM];
    chatBox.innerHTML = "";
    showWelcome();
}

/* ---------- markdown renderer (safe: escapes HTML first) ---------- */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
    return s
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function codeBlock({ lang, code }) {
    return `<div class="code" data-lang="${lang}">
        <div class="code-head">
            <span class="dots"><i></i><i></i><i></i></span>
            <span class="lang">${lang || "code"}</span>
            <button class="mini" data-act="copy">Copy</button>
            <button class="mini" data-act="dl">Download</button>
        </div>
        <pre><code>${esc(code)}</code></pre>
    </div>`;
}

function render(md) {
    const blocks = [];
    md = md.replace(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g, (_, lang, code) => {
        blocks.push({ lang: lang.toLowerCase(), code: code.replace(/\n$/, "") });
        return `\n@@CODE${blocks.length - 1}@@\n`;
    });

    const out = [];
    let list = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const openList = (t) => { if (list !== t) { closeList(); out.push(`<${t}>`); list = t; } };

    for (const raw of esc(md).split("\n")) {
        const line = raw.trim();
        let m;
        if ((m = line.match(/^@@CODE(\d+)@@$/))) { closeList(); out.push(codeBlock(blocks[m[1]])); }
        else if ((m = line.match(/^(#{1,4})\s+(.*)/))) { closeList(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
        else if ((m = line.match(/^[-*]\s+(.*)/))) { openList("ul"); out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^\d+[.)]\s+(.*)/))) { openList("ol"); out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^&gt;\s?(.*)/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
        else if (!line) { closeList(); }
        else { closeList(); out.push(`<p>${inline(line)}</p>`); }
    }
    closeList();
    return out.join("");
}

/* ---------- copy / download / chips (event delegation) ---------- */
const EXT = {
    javascript: "js", js: "js", typescript: "ts", ts: "ts", python: "py", py: "py", html: "html", css: "css",
    json: "json", java: "java", cpp: "cpp", "c++": "cpp", c: "c", csharp: "cs", cs: "cs", bash: "sh", sh: "sh",
    sql: "sql", go: "go", rust: "rs", php: "php", ruby: "rb", yaml: "yml", markdown: "md"
};

function flash(btn, label) {
    const old = btn.textContent;
    btn.textContent = label;
    setTimeout(() => (btn.textContent = old), 1300);
}

chatBox.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === "chip") return sendMessage(btn.dataset.p);

    try {
        if (act === "copymsg") {
            await navigator.clipboard.writeText(btn.closest(".message")._raw);
            return flash(btn, "Copied!");
        }
        const block = btn.closest(".code");
        const code = block.querySelector("code").textContent;
        if (act === "copy") {
            await navigator.clipboard.writeText(code);
            flash(btn, "Copied!");
        } else if (act === "dl") {
            const ext = EXT[block.dataset.lang] || "txt";
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
            a.download = `code-${Date.now()}.${ext}`;
            a.click();
            URL.revokeObjectURL(a.href);
            flash(btn, "Saved!");
        }
    } catch {
        flash(btn, "Failed");
    }
});

showWelcome();
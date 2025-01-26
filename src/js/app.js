// app.js
let db;
function initDB() {
  if (!("indexedDB" in window)) return;
  const request = indexedDB.open("chatDB", 2);
  request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("chats")) {
      db.createObjectStore("chats", { keyPath: "chatId" });
    }
    if (!db.objectStoreNames.contains("threads")) {
      db.createObjectStore("threads", { keyPath: "id" });
    }
  };
  request.onsuccess = (event) => {
    db = event.target.result;
  };
  request.onerror = (event) => {
    console.error("IndexedDB error:", event);
  };
}
// Store chat in IndexedDB
function storeChat(chatId, messages, page = 1) {
  if (!db) return;
  const tx = db.transaction("chats", "readwrite");
  const store = tx.objectStore("chats");

  // First get existing chat data
  const getRequest = store.get(chatId);

  getRequest.onsuccess = () => {
    const existingChat = getRequest.result;
    let updatedMessages;

    if (existingChat && page > 1) {
      // For pagination, merge new messages with existing ones
      const existingIds = new Set(existingChat.messages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));
      updatedMessages = [...existingChat.messages, ...newMessages];
    } else {
      // For first page or new chat, just use new messages
      updatedMessages = messages;
    }

    // Store updated chat data
    store.put({
      chatId,
      messages: updatedMessages,
      timestamp: Date.now(),
      lastPage: page,
    });
  };
}

// Store threads in IndexedDB
function storeThreads(threads, page = 1) {
  if (!db) return;
  const tx = db.transaction("threads", "readwrite");
  const store = tx.objectStore("threads");

  // If it's the first page, clear existing threads
  if (page === 1) {
    store.clear();
  }

  // Store each thread with timestamp and page info
  threads.forEach((thread) => {
    store.put({
      ...thread,
      timestamp: Date.now(),
      page: page,
    });
  });
}

// Retrieve all chats
function getAllChats(page = 1, limit = 10) {
  return new Promise((resolve) => {
    if (!db) return resolve({ chats: [], totalChats: 0, totalPages: 0 });
    const tx = db.transaction("chats", "readonly");
    const store = tx.objectStore("chats");
    const req = store.getAll();
    req.onsuccess = () => {
      const allChats = req.result;
      // Sort by timestamp descending (newest first)
      allChats.sort((a, b) => b.timestamp - a.timestamp);
      // Calculate pagination
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedChats = allChats.slice(start, end);
      resolve({
        chats: paginatedChats,
        totalChats: allChats.length,
        totalPages: Math.ceil(allChats.length / limit),
      });
    };
  });
}
// Retrieve threads with pagination
function getAllThreads(page = 1, limit = 10) {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const tx = db.transaction("threads", "readonly");
    const store = tx.objectStore("threads");
    const req = store.getAll();
    req.onsuccess = () => {
      const allThreads = req.result;
      // Sort by timestamp descending (newest first)
      allThreads.sort((a, b) => b.timestamp - a.timestamp);
      // Calculate pagination
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedThreads = allThreads.slice(start, end);
      resolve({
        threads: paginatedThreads,
        totalThreads: allThreads.length,
        totalPages: Math.ceil(allThreads.length / limit),
      });
    };
  });
}

function removeChat(chatId) {
  if (!db) return;
  const tx = db.transaction("chats", "readwrite");
  const store = tx.objectStore("chats");
  store.delete(chatId);
}

function removeThread(threadId) {
  if (!db) return;
  const tx = db.transaction("threads", "readwrite");
  const store = tx.objectStore("threads");
  store.delete(threadId);
}

const apiBaseUrl = "https://apis.erzen.tk";
let accessToken = localStorage.getItem("accessToken");
let refreshInterval;
let chatHistory = [];

let currentThreadPage = 1;
const THREADS_PER_PAGE = 3;
let currentMessagePage = 1;

const AIModels = {
  // Gemini Models
  Gemini: "gemini-exp-1121",
  GeminiFast: "gemini-1.5-flash",
  GeminiFastCheap: "gemini-1.5-flash-8b",
  GeminiBetter: "gemini-2.0-flash-exp",
  GeminiAdvanced: "gemini-2.0-flash-thinking-exp",

  // OpenAI Models
  GPT4OMini: "gpt-4o-mini-2024-07-18",
  GTP40: "chatgpt-4o-latest",
  GPTO1: "o1",
  GPTO1Mini: "o1-mini",
  GPT35Turbo: "gpt-3.5-turbo-0125",

  // Deepseek Models
  DeepseekV3: "deepseek-chat",
  DeepseekR1: "deepseek-reasoner",

  // Llama Models
  LlamaV3_3_70B: "accounts/fireworks/models/llama-v3p3-70b-instruct",
  Llama_DeepseekV3: "accounts/fireworks/models/deepseek-v3",
  LlamaV3_1_400B: "accounts/fireworks/models/llama-v3p1-405b-instruct",
  LlamaV3_1_8B: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  GemmaV2Big: "accounts/fireworks/models/gemma2-9b-it",
  GemmaV1Big: "accounts/fireworks/models/gemma-7b-it",
  GemmaV1Small: "accounts/fireworks/models/gemma-2b-it",
  Qwen2: "accounts/fireworks/models/qwen2p5-72b-instruct",
  Qwen2Coder: "accounts/fireworks/models/qwen2p5-coder-32b-instruct",
  NousResearch: "accounts/fireworks/models/nous-hermes-2-mixtral-8x7b-dpo",
  Mistral22B: "accounts/fireworks/models/hermes-2-pro-mistral-7b",
};

const modelDisplayNames = {
  "gemini-2.0-flash-exp": "Gemini 2.0",
  "gemini-2.0-flash-thinking-exp": "Gemini 2.0 Thinking",
  "gemini-exp-1121": "Gemini 2.0 Experimental",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "gemini-1.5-flash-8b": "Gemini 1.5 Flash (Light)",
  "gpt-4o-mini-2024-07-18": "GPT-4 Mini",
  "chatgpt-4o-latest": "GPT-4o",
  o1: "OpenAI o1",
  "o1-mini": "OpenAI o1 Mini",
  "gpt-3.5-turbo-0125": "GPT-3.5 Turbo",
  "deepseek-chat": "Deepseek V3",
  "deepseek-reasoner": "Deepseek R1",
  "accounts/fireworks/models/llama-v3p3-70b-instruct": "Llama 3 (70B)",
  "accounts/fireworks/models/deepseek-v3": "Deepseek V3 (Fireworks)",
  "accounts/fireworks/models/llama-v3p1-405b-instruct": "Llama 3 (400B)",
  "accounts/fireworks/models/llama-v3p1-8b-instruct": "Llama 3 (8B)",
  "accounts/fireworks/models/gemma2-9b-it": "Gemma 2.0 (9B)",
  "accounts/fireworks/models/gemma-7b-it": "Gemma (7B)",
  "accounts/fireworks/models/gemma-2b-it": "Gemma (2B)",
  "accounts/fireworks/models/qwen2p5-72b-instruct": "Qwen 2.5",
  "accounts/fireworks/models/qwen2p5-coder-32b-instruct": "Qwen 2.5 Coder",
  "accounts/fireworks/models/nous-hermes-2-mixtral-8x7b-dpo": "Nous Hermes 2",
  "accounts/fireworks/models/hermes-2-pro-mistral-7b": "Mistral (7B)",
};

let currentChatId = null;
let currentModel = AIModels.GeminiBetter;
const modelSelect = document.getElementById("model-select");

function initModelSelector() {
  Object.entries(AIModels).forEach(([_, value]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = modelDisplayNames[value];
    modelSelect.appendChild(option);
  });
  modelSelect.value = currentModel;
}

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  setupForm();
  setupTabs();
  setupHamburgerMenu();
  setupClearMemory();
  setupInstructionForm();
  initModelSelector();
  initDB();
});

function checkAuth() {
  fetch(`${apiBaseUrl}/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.accessToken) {
        accessToken = data.accessToken;
        localStorage.setItem("accessToken", accessToken);
        startTokenRefresh();
        loadUserMemory();
        loadUserInstructions();
        loadChatThreads();
      } else {
        redirectToLogin();
      }
    })
    .catch(redirectToLogin);
}

function redirectToLogin() {
  window.location.href =
    "https://auth.erzen.tk?return_to=" +
    encodeURIComponent(window.location.href);
}

function startTokenRefresh() {
  refreshInterval = setInterval(() => {
    fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.accessToken) {
          accessToken = data.accessToken;
          localStorage.setItem("accessToken", accessToken);
        } else {
          clearInterval(refreshInterval);
          redirectToLogin();
        }
      })
      .catch(() => {
        clearInterval(refreshInterval);
        redirectToLogin();
      });
  }, 9 * 60 * 1000); // Refresh every 9 minutes
}

function setupForm() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (message) {
      addMessage("user", message);
      input.value = "";
      sendMessage(message);
    }
  });
}

document.getElementById("new-chat").addEventListener("click", () => {
  currentChatId = null;
  document.getElementById("chat-history").innerHTML = "";
  document
    .querySelectorAll(".thread-item")
    .forEach((item) => item.classList.remove("active"));
});

// Load chat threads
async function loadChatThreads(page = 1, limit = 17) {
  // First load threads from IndexedDB
  const cachedData = await getAllThreads(page, limit);
  if (cachedData.threads.length > 0) {
    displayThreads(cachedData.threads);
  }

  // Then fetch from API and update if needed
  try {
    const response = await fetch(
      `${apiBaseUrl}/intelligence/chat/threads?page=${page}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();
    storeThreads(data, page);

    // Compare with cached data and only update if different
    if (JSON.stringify(data) !== JSON.stringify(cachedData.threads)) {
      displayThreads(data);
    }
  } catch (error) {
    console.error("Failed to load threads from API:", error);
  }
}

// Helper function to display threads
function displayThreads(threads) {
  // Sort threads by date
  threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const list = document.getElementById("threads-list");
  list.innerHTML = "";
  let currentGroup = null;

  threads.forEach((thread) => {
    const threadDate = new Date(thread.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let dateGroup;
    if (threadDate.toDateString() === today.toDateString()) {
      dateGroup = "Today";
    } else if (threadDate.toDateString() === yesterday.toDateString()) {
      dateGroup = "Yesterday";
    } else if (threadDate > new Date(today - 3 * 24 * 60 * 60 * 1000)) {
      dateGroup = "Last 3 Days";
    } else if (threadDate > new Date(today - 7 * 24 * 60 * 60 * 1000)) {
      dateGroup = "Last 7 Days";
    } else if (threadDate.getMonth() === today.getMonth()) {
      dateGroup = "This Month";
    } else if (threadDate.getFullYear() === today.getFullYear()) {
      dateGroup = "This Year";
    } else {
      dateGroup = "Older";
    }

    if (dateGroup !== currentGroup) {
      const groupHeader = document.createElement("div");
      groupHeader.className = "thread-group-header";
      groupHeader.textContent = dateGroup;
      list.appendChild(groupHeader);
      currentGroup = dateGroup;
    }

    const div = document.createElement("div");
    div.className = "thread-item";
    div.textContent = thread.title || "New Chat";
    div.dataset.threadId = thread.id;
    if (thread.id === currentChatId) {
      div.classList.add("active");
    }
    div.addEventListener("click", () => {
      currentChatId = thread.id;
      document
        .querySelectorAll(".thread-item")
        .forEach((item) => item.classList.remove("active"));
      div.classList.add("active");
      loadThreadMessages(thread.id);
    });
    list.appendChild(div);
  });
}
// Load messages for a thread
async function loadThreadMessages(threadId, page = 1, limit = 10) {
  // First try to load from IndexedDB
  const cachedData = await getAllChats(page, limit);
  const cachedChat = cachedData.chats.find((chat) => chat.chatId === threadId);

  if (cachedChat) {
    const history = document.getElementById("chat-history");
    history.innerHTML = "";

    // Display cached messages
    cachedChat.messages.sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    cachedChat.messages.forEach((msg) => {
      addMessage(msg.role === "user" ? "user" : "bot", msg.content);
    });
  }

  // Then fetch from API and update if needed
  try {
    const response = await fetch(
      `${apiBaseUrl}/intelligence/chat/thread/${threadId}?page=${page}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();

    // Process new messages from API
    if (data && Array.isArray(data)) {
      // Sort new messages by date
      const sortedNewMessages = data.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      // If we have cached messages, merge with new ones
      if (cachedChat) {
        // Create a Set of existing message IDs for quick lookup
        const existingIds = new Set(cachedChat.messages.map((msg) => msg.id));

        // Filter out messages that we already have
        const newMessages = sortedNewMessages.filter(
          (msg) => !existingIds.has(msg.id)
        );

        if (newMessages.length > 0) {
          // Store only if we have new messages
          storeChat(threadId, [...cachedChat.messages, ...newMessages], page);

          // Update display with new messages
          newMessages.forEach((msg) => {
            addMessage(msg.role === "user" ? "user" : "bot", msg.content);
          });
        }
      } else {
        // No cached data, store and display all messages
        storeChat(threadId, sortedNewMessages, page);

        const history = document.getElementById("chat-history");
        history.innerHTML = "";
        sortedNewMessages.forEach((msg) => {
          addMessage(msg.role === "user" ? "user" : "bot", msg.content);
        });
      }
    }
  } catch (error) {
    console.error("Failed to load messages:", error);
    if (!cachedChat) {
      document.getElementById("chat-history").innerHTML =
        "<div class='message bot'>Failed to load messages.</div>";
    }
  }
}

function addMessage(sender, content, isStreaming = false) {
  const chatHistoryEl = document.getElementById("chat-history");
  const messageEl = document.createElement("div");
  messageEl.className = `message ${sender} ${isStreaming ? "streaming" : ""}`;

  const textEl = document.createElement("div");
  textEl.className = "text";
  textEl.innerHTML = isStreaming ? content : marked.parse(content);

  messageEl.appendChild(textEl);
  chatHistoryEl.appendChild(messageEl);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

  return textEl;
}

async function sendMessage(message) {
  const stream = false;
  const model = modelSelect.value;
  const body = {
    message,
    model,
    chatId: currentChatId || undefined,
  };

  const typingIndicator = createTypingIndicator();
  const chatHistoryEl = document.getElementById("chat-history");
  try {
    chatHistoryEl.appendChild(typingIndicator);

    const response = await fetch(
      `${apiBaseUrl}/intelligence/chat${stream ? "/stream" : ""}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) throw new Error("Request failed");

    chatHistoryEl.removeChild(typingIndicator);

    if (stream) {
      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      const botMessage = addMessage("bot", "", true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process each complete line
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line for next chunk

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
              if (data.content) {
                fullContent += data.content;
                botMessage.innerHTML = marked.parse(fullContent);
                botMessage.scrollIntoView({ behavior: "smooth" });
              }
            } catch (e) {
              console.error("Error parsing stream chunk:", e);
            }
          }
        }
      }

      // Final update with remaining buffer
      if (buffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.content) {
            fullContent += data.content;
            botMessage.innerHTML = marked.parse(fullContent);
          }
        } catch (e) {
          console.error("Error parsing final chunk:", e);
        }
      }

      // Update chatId if new thread created
      if (chatInfo.chatId) {
        currentChatId = chatInfo.chatId;
        loadChatThreads();
      }
    } else {
      // Existing non-stream handling
      const data = await response.json();
      addMessage("bot", data.result.content);

      if (!currentChatId && data.chatId) {
        currentChatId = data.chatId;
        loadChatThreads();
      }
    }
  } catch (error) {
    console.error("Error:", error);
    chatHistoryEl.removeChild(typingIndicator);
    addMessage("bot", "Sorry, I couldn't process your message.");
  }
}

function createTypingIndicator() {
  const typingEl = document.createElement("div");
  typingEl.classList.add("message", "bot", "typing-indicator");

  const dot1 = document.createElement("span");
  dot1.classList.add("dot");
  const dot2 = document.createElement("span");
  dot2.classList.add("dot");
  const dot3 = document.createElement("span");
  dot3.classList.add("dot");

  typingEl.appendChild(dot1);
  typingEl.appendChild(dot2);
  typingEl.appendChild(dot3);

  return typingEl;
}

const typingIndicator = createTypingIndicator();

function setupTabs() {
  const memoryTab = document.getElementById("memory-tab");
  const instructionsTab = document.getElementById("instructions-tab");
  const threadsTab = document.getElementById("threads-tab");
  const memoryContent = document.getElementById("memory-content");
  const instructionsContent = document.getElementById("instructions-content");
  const threadsContent = document.getElementById("threads-content");

  memoryTab.addEventListener("click", () => {
    memoryTab.classList.add("active");
    instructionsTab.classList.remove("active");
    threadsTab.classList.remove("active");
    memoryContent.classList.add("active");
    instructionsContent.classList.remove("active");
    threadsContent.classList.remove("active");
  });

  instructionsTab.addEventListener("click", () => {
    instructionsTab.classList.add("active");
    memoryTab.classList.remove("active");
    threadsTab.classList.remove("active");
    instructionsContent.classList.add("active");
    memoryContent.classList.remove("active");
    threadsContent.classList.remove("active");
  });

  threadsTab.addEventListener("click", () => {
    threadsTab.classList.add("active");
    memoryTab.classList.remove("active");
    instructionsTab.classList.remove("active");
    threadsContent.classList.add("active");
    memoryContent.classList.remove("active");
    instructionsContent.classList.remove("active");
  });
}

function setupHamburgerMenu() {
  const hamburger = document.getElementById("hamburger-menu");
  const sidebar = document.getElementById("sidebar");
  const chatArea = document.getElementById("chat-area");

  hamburger.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent triggering the document click event
    sidebar.classList.toggle("active");
    chatArea.classList.toggle("sidebar-active");
  });

  // Close sidebar when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !sidebar.contains(e.target) &&
      !hamburger.contains(e.target) &&
      sidebar.classList.contains("active")
    ) {
      sidebar.classList.remove("active");
    }
  });
}

function loadUserMemory() {
  fetch(`${apiBaseUrl}/intelligence/chat/memory`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const memoryContent = document.getElementById("memory-content");
      // Render memory data
      data.forEach((item) => {
        const p = document.createElement("p");
        p.textContent = item.value;
        memoryContent.appendChild(p);
      });
    })
    .catch(() => {
      const memoryContent = document.getElementById("memory-content");
      memoryContent.innerHTML = "<p>Failed to load memory.</p>";
    });
}

function loadUserInstructions() {
  fetch(`${apiBaseUrl}/intelligence/chat/instruction`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const instructionsContent = document.getElementById(
        "instructions-content"
      );
      const instructionsList = document.getElementById("instructions-list");
      instructionsList.innerHTML = "";

      data.forEach((instruction) => {
        const div = document.createElement("div");
        div.classList.add("instruction-item");

        const content = document.createElement("span");
        content.textContent = instruction.job;

        const controls = document.createElement("div");
        controls.classList.add("controls");

        const editBtn = document.createElement("button");
        editBtn.innerHTML = `<i class="fa-solid fa-pen"></i>`;
        editBtn.onclick = () =>
          editInstruction(instruction.id, instruction.job);

        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        deleteBtn.classList.add("delete");
        deleteBtn.onclick = () => deleteInstruction(instruction.id);

        controls.appendChild(editBtn);
        controls.appendChild(deleteBtn);

        div.appendChild(content);
        div.appendChild(controls);
        instructionsList.appendChild(div);
      });
    })
    .catch(() => {
      const instructionsContent = document.getElementById(
        "instructions-content"
      );
      instructionsContent.innerHTML = "<p>Failed to load instructions.</p>";
    });
}

function setupClearMemory() {
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "clear-memory") {
      clearMemory();
    }
  });
}

function clearMemory() {
  if (confirm("Are you sure you want to clear all memory?")) {
    fetch(`${apiBaseUrl}/intelligence/chat/memory`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((response) => {
        if (response.ok) {
          loadUserMemory();
        } else {
          alert("Failed to clear memory.");
        }
      })
      .catch(() => {
        alert("Failed to clear memory.");
      });
  }
}

function setupInstructionForm() {
  const form = document.getElementById("instruction-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("instruction-input");
    const content = input.value.trim();
    if (content.length < 30 || content.length > 200) {
      alert("Instruction must be between 30 and 200 characters.");
      return;
    }
    addInstruction(content);
  });
}

function addInstruction(content) {
  // Add instruction
  fetch(`${apiBaseUrl}/intelligence/chat/instruction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ job: content }),
  })
    .then((response) => {
      if (response.ok) {
        loadUserInstructions();
        document.getElementById("instruction-input").value = "";
      } else {
        alert("Failed to add instruction.");
      }
    })
    .catch(() => {
      alert("Failed to add instruction.");
    });
}

function editInstruction(id, currentContent) {
  const newContent = prompt("Edit your instruction:", currentContent);
  if (newContent) {
    if (newContent.length < 30 || newContent.length > 200) {
      alert("Instruction must be between 30 and 200 characters.");
      return;
    }
    fetch(`${apiBaseUrl}/intelligence/chat/instruction/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ job: newContent }),
    })
      .then((response) => {
        if (response.ok) {
          loadUserInstructions();
        } else {
          alert("Failed to update instruction.");
        }
      })
      .catch(() => {
        alert("Failed to update instruction.");
      });
  }
}

function deleteInstruction(id) {
  if (confirm("Are you sure you want to delete this instruction?")) {
    fetch(`${apiBaseUrl}/intelligence/chat/instruction/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((response) => {
        if (response.ok) {
          loadUserInstructions();
        } else {
          alert("Failed to delete instruction.");
        }
      })
      .catch(() => {
        alert("Failed to delete instruction.");
      });
  }
}

function isJsonString(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

function formatJson(str) {
  try {
    const obj = JSON.parse(str);
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return str;
  }
}

// Function to load more messages
async function loadMoreMessages(chatId) {
  // Fetch older messages
  const response = await fetch(
    `${apiBaseUrl}/intelligence/chat/thread/${chatId}?page=${
      currentMessagePage + 1
    }&limit=10`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const newMessages = await response.json();
  // Ensure newMessages is an array and not empty
  if (!Array.isArray(newMessages) || newMessages.length === 0) {
    return;
  }
  // Prepend new messages to the chat history
  const chatHistoryEl = document.getElementById("chat-history");
  [...newMessages].reverse().forEach((message) => {
    const messageEl = addMessage(
      message.role === "user" ? "user" : "bot",
      message.content
    );
    chatHistoryEl.insertBefore(
      messageEl.parentElement,
      chatHistoryEl.firstChild
    );
  });
  currentMessagePage += 1;
}

// Add scroll event listener to chat history
const chatHistoryEl = document.getElementById("chat-history");
chatHistoryEl.addEventListener("scroll", () => {
  if (chatHistoryEl.scrollTop === 0) {
    loadMoreMessages(currentChatId);
  }
});

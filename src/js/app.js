// app.js

const apiBaseUrl = "https://apis.erzen.tk";
let accessToken = localStorage.getItem("accessToken");
let refreshInterval;
let chatHistory = [];

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  setupForm();
  setupTabs();
  setupHamburgerMenu();
  setupClearMemory();
  setupInstructionForm();
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

function addMessage(sender, text) {
  const chatHistoryEl = document.getElementById("chat-history");
  const messageEl = document.createElement("div");
  messageEl.classList.add("message", sender);

  const textEl = document.createElement("div");
  textEl.classList.add("text");

  // Parse Markdown to HTML
  textEl.innerHTML = marked.parse(text);

  messageEl.appendChild(textEl);
  chatHistoryEl.appendChild(messageEl);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

  // Add to history for API
  chatHistory.push({
    sender: sender,
    message: typeof text === "object" ? JSON.stringify(text) : text,
    timestamp: new Date().toISOString(),
  });
}

function sendMessage(message) {
  // Show typing indicator
  const typingIndicator = createTypingIndicator();
  chatHistoryEl = document.getElementById("chat-history");
  chatHistoryEl.appendChild(typingIndicator);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

  fetch(`${apiBaseUrl}/intelligence/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: message,
      history: chatHistory,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      // Remove typing indicator
      typingIndicator.remove();

      if (data.result && data.result.content) {
        let content = data.result.content;

        // If content is an object, display it directly
        if (typeof content === "object") {
          addMessage("bot", content);
        }
        // If content is a string, check if it's JSON
        else if (typeof content === "string") {
          if (isJsonString(content)) {
            const parsed = JSON.parse(content);
            addMessage("bot", parsed);
          } else {
            addMessage("bot", content);
          }
        } else {
          addMessage("bot", "Sorry, I did not understand that.");
        }

        // Add bot response to history
        chatHistory.push({
          sender: "bot",
          message:
            typeof content === "object" ? JSON.stringify(content) : content,
          timestamp: new Date().toISOString(),
        });
      } else {
        addMessage("bot", "Sorry, I did not understand that.");
      }
    })
    .catch(() => {
      // Remove typing indicator in case of error
      typingIndicator.remove();
      addMessage("bot", "An error occurred. Please try again.");
    });
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
  const memoryContent = document.getElementById("memory-content");
  const instructionsContent = document.getElementById("instructions-content");

  memoryTab.addEventListener("click", () => {
    memoryTab.classList.add("active");
    instructionsTab.classList.remove("active");
    memoryContent.classList.add("active");
    instructionsContent.classList.remove("active");
  });

  instructionsTab.addEventListener("click", () => {
    instructionsTab.classList.add("active");
    memoryTab.classList.remove("active");
    instructionsContent.classList.add("active");
    memoryContent.classList.remove("active");
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
  fetch(`${apiBaseUrl}/intelligence/userMemory`, {
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
  fetch(`${apiBaseUrl}/intelligence/user-instruction`, {
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
    fetch(`${apiBaseUrl}/intelligence/userMemory`, {
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
  fetch(`${apiBaseUrl}/intelligence/user-instruction`, {
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
    fetch(`${apiBaseUrl}/intelligence/user-instruction/${id}`, {
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
    fetch(`${apiBaseUrl}/intelligence/user-instruction/${id}`, {
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

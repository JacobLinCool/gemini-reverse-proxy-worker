// Set the current hostname as the base URL
const baseUrl = window.location.origin + "/";

// Configuration Manager
const adminSecretEl = document.getElementById("adminSecret");
const loadConfigBtn = document.getElementById("loadConfig");
const configEditor = document.getElementById("configEditor");
const configListEl = document.getElementById("configList");
const addConfigItemBtn = document.getElementById("addConfigItem");
const saveConfigBtn = document.getElementById("saveConfig");
const configStatusEl = document.getElementById("configStatus");
const configItemTemplate = document.getElementById("configItemTemplate");

function addConfigItem(key = "", baseUrl = "", readonly = false) {
    const clone = configItemTemplate.content.cloneNode(true);
    const itemEl = clone.querySelector(".config-item");
    const keyInput = clone.querySelector(".config-key");
    const baseUrlInput = clone.querySelector(".config-base-url");
    const removeBtn = clone.querySelector(".remove-item");

    keyInput.value = key;
    baseUrlInput.value = baseUrl;

    if (readonly) {
        keyInput.disabled = true;
        baseUrlInput.disabled = true;
        removeBtn.style.display = "none";
    } else {
        removeBtn.addEventListener("click", () => {
            itemEl.remove();
        });
    }

    configListEl.appendChild(clone);
}

if (addConfigItemBtn) {
    addConfigItemBtn.addEventListener("click", () => {
        addConfigItem();
    });
}

if (loadConfigBtn) {
    loadConfigBtn.addEventListener("click", async () => {
        const secret = adminSecretEl.value;
        if (!secret) {
            alert("Please enter the Admin Secret");
            return;
        }

        try {
            const resp = await fetch(`${baseUrl}_config`, {
                headers: {
                    Authorization: `Bearer ${secret}`,
                },
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || resp.statusText);
            }

            const data = await resp.json();

            // Clear existing items
            configListEl.innerHTML = "";

            // Add items from config
            const maxLength = Math.max(data.keys.length, data.baseUrls.length);
            for (let i = 0; i < maxLength; i++) {
                addConfigItem(
                    data.keys[i] || "",
                    data.baseUrls[i] || "",
                    data.readonly,
                );
            }

            // Add one empty item if list is empty and not readonly
            if (maxLength === 0 && !data.readonly) {
                addConfigItem();
            }

            // Handle readonly state
            if (data.readonly) {
                addConfigItemBtn.style.display = "none";
                saveConfigBtn.style.display = "none";
                configStatusEl.textContent =
                    "Configuration is read-only (using environment variables)";
            } else {
                addConfigItemBtn.style.display = "inline-block";
                saveConfigBtn.style.display = "inline-block";
                configStatusEl.textContent = "Configuration loaded";
            }

            configEditor.style.display = "block";
        } catch (err) {
            alert(`Failed to load configuration: ${err.message}`);
        }
    });
}

if (saveConfigBtn) {
    saveConfigBtn.addEventListener("click", async () => {
        const secret = adminSecretEl.value;
        if (!secret) {
            alert("Please enter the Admin Secret");
            return;
        }

        const items = configListEl.querySelectorAll(".config-item");
        const keys = [];
        const baseUrls = [];

        items.forEach((item) => {
            const key = item.querySelector(".config-key").value.trim();
            const baseUrl = item.querySelector(".config-base-url").value.trim();

            if (key || baseUrl) {
                keys.push(key);
                baseUrls.push(baseUrl);
            }
        });

        try {
            const resp = await fetch(`${baseUrl}_config`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${secret}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ keys, baseUrls }),
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || resp.statusText);
            }

            configStatusEl.textContent = "Configuration saved successfully";
            setTimeout(() => {
                configStatusEl.textContent = "";
            }, 3000);
        } catch (err) {
            alert(`Failed to save configuration: ${err.message}`);
        }
    });
}

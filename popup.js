const saveBtn = document.getElementById("saveLinkBtn");
const cardsContainer = document.getElementById("cardsContainer");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const manualTitle = document.getElementById("manualTitle");
const manualUrl = document.getElementById("manualUrl");
const manualCategory = document.getElementById("manualCategory");
const addManualBtn = document.getElementById("addManualBtn");
const newCategoryInput = document.getElementById("newCategoryInput");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const categoryList = document.getElementById("categoryList");
const addLinkToggle = document.getElementById("addLinkToggle");
const addLinkContent = document.getElementById("addLinkContent");
const addCategoryToggle = document.getElementById("addCategoryToggle");
const addCategoryContent = document.getElementById("addCategoryContent");
const categoryItemTemplate = document.getElementById("categoryItemTemplate");
const categoryCardTemplate = document.getElementById("categoryCardTemplate");

let cards = [];
let categories = ["Tickets", "Figma", "Work", "Daily Tools", "Personal", "Other"];

function persistCards() {
  chrome.storage.sync.set({ cards });
}

function persistCategories() {
  chrome.storage.sync.set({ categories });
}

function loadData() {
  chrome.storage.sync.get(["cards", "categories"], data => {
    cards = data.cards || [];
    if (data.categories && data.categories.length > 0) {
      categories = data.categories;
    }
    updateCategoryUI();
    renderCards();
  });
}

function updateCategoryUI() {
  // Update filter dropdown
  categoryFilter.innerHTML = '<option value="all">All categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });

  // Update manual category dropdown
  manualCategory.innerHTML = "";
  categories.forEach((cat, i) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (cat === "Work") opt.selected = true;
    manualCategory.appendChild(opt);
  });

  // Update category list in manage section
  categoryList.innerHTML = "";
  categories.forEach(cat => {
    const tag = document.createElement("span");
    tag.className = "category-tag";
    tag.innerHTML = `${cat}<button class="remove-cat" data-cat="${cat}">×</button>`;
    categoryList.appendChild(tag);
  });

  // Bind remove events
  categoryList.querySelectorAll(".remove-cat").forEach(btn => {
    btn.addEventListener("click", e => {
      const catToRemove = e.target.dataset.cat;
      categories = categories.filter(c => c !== catToRemove);
      persistCategories();
      updateCategoryUI();
      renderCards();
    });
  });
}

function normalizeUrl(url) {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    return "https://" + url;
  }
  return url;
}

function createCategoryItemElement(card) {
  const node = categoryItemTemplate.content.firstElementChild.cloneNode(true);
  const titleEl = node.querySelector(".category-item-title");
  const urlEl = node.querySelector(".category-item-url");
  const openBtn = node.querySelector(".item-open");
  const copyBtn = node.querySelector(".item-copy");
  const deleteBtn = node.querySelector(".item-delete");
  const pinBtn = node.querySelector(".item-pin");

  titleEl.textContent = card.title || "(No title)";
  urlEl.textContent = card.url;
  urlEl.href = card.url;

  if (card.pinned) {
    pinBtn.classList.add("pinned");
  }

  openBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: card.url });
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(card.url);
    } catch (e) {
      console.error("Clipboard failed:", e);
    }
  });

  deleteBtn.addEventListener("click", () => {
    cards = cards.filter(c => c.id !== card.id);
    persistCards();
    renderCards();
  });

  pinBtn.addEventListener("click", () => {
    card.pinned = !card.pinned;
    persistCards();
    renderCards();
  });

  return node;
}

function renderCards() {
  cardsContainer.innerHTML = "";

  let filtered = [...cards];

  const q = (searchInput.value || "").toLowerCase();
  if (q) {
    filtered = filtered.filter(c =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.url || "").toLowerCase().includes(q)
    );
  }

  const selectedCategory = categoryFilter.value;
  if (selectedCategory && selectedCategory !== "all") {
    filtered = filtered.filter(c => (c.category || "Work") === selectedCategory);
  }

  // Sort: pinned first, then by creation date
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No cards yet. Save current tab or add a custom link.";
    cardsContainer.appendChild(empty);
    return;
  }

  // Group by category
  const grouped = {};
  filtered.forEach(card => {
    const cat = card.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(card);
  });

  // Render category cards
  const categoryOrder = categories.filter(c => grouped[c]);
  // Add any categories not in the list
  Object.keys(grouped).forEach(cat => {
    if (!categoryOrder.includes(cat)) categoryOrder.push(cat);
  });

  categoryOrder.forEach(cat => {
    const items = grouped[cat];
    if (!items || !items.length) return;

    const cardNode = categoryCardTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = cardNode.querySelector(".category-card-title");
    const countEl = cardNode.querySelector(".category-card-count");
    const itemsContainer = cardNode.querySelector(".category-card-items");

    titleEl.textContent = cat;
    countEl.textContent = `${items.length} link${items.length > 1 ? 's' : ''}`;

    items.forEach(item => {
      const itemEl = createCategoryItemElement(item);
      itemsContainer.appendChild(itemEl);
    });

    cardsContainer.appendChild(cardNode);
  });
}

function addCard(card) {
  cards.push(card);
  persistCards();
  renderCards();
}

saveBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    const card = {
      id: Date.now(),
      title: tab.title || "",
      url: tab.url,
      category: inferCategoryFromUrl(tab.url),
      pinned: false,
      createdAt: Date.now()
    };

    addCard(card);
  });
});

addManualBtn.addEventListener("click", () => {
  const title = manualTitle.value.trim();
  const url = normalizeUrl(manualUrl.value.trim());
  const category = manualCategory.value;

  if (!url) return;

  const card = {
    id: Date.now(),
    title: title || url,
    url,
    category,
    pinned: false,
    createdAt: Date.now()
  };

  addCard(card);
  manualTitle.value = "";
  manualUrl.value = "";
});

addCategoryBtn.addEventListener("click", () => {
  const newCat = newCategoryInput.value.trim();
  if (!newCat || categories.includes(newCat)) return;

  categories.push(newCat);
  persistCategories();
  updateCategoryUI();
  newCategoryInput.value = "";
});

newCategoryInput.addEventListener("keypress", e => {
  if (e.key === "Enter") {
    addCategoryBtn.click();
  }
});

searchInput.addEventListener("input", renderCards);
categoryFilter.addEventListener("change", renderCards);

// Collapsible toggles
addLinkToggle.addEventListener("click", () => {
  const content = addLinkContent;
  const icon = addLinkToggle.querySelector(".collapse-icon");
  content.classList.toggle("collapsed");
  icon.textContent = content.classList.contains("collapsed") ? "▶" : "▼";
});

addCategoryToggle.addEventListener("click", () => {
  const content = addCategoryContent;
  const icon = addCategoryToggle.querySelector(".collapse-icon");
  content.classList.toggle("collapsed");
  icon.textContent = content.classList.contains("collapsed") ? "▶" : "▼";
});

function inferCategoryFromUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes("figma.com")) return "Figma";
  if (lower.includes("linear.app") || lower.includes("jira") || lower.includes("youtrack") || lower.includes("ticket"))
    return "Tickets";
  if (lower.includes("github.com") || lower.includes("gitlab") || lower.includes("bitbucket"))
    return "Work";
  if (lower.includes("notion.so") || lower.includes("slack.com"))
    return "Daily Tools";
  return "Other";
}

document.addEventListener("DOMContentLoaded", loadData);

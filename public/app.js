const managers = ["lebedeva", "terekhova", "kuznetsova"];
const boardElement = document.querySelector("#board");
const form = document.querySelector("#supplier-form");
const nameInput = document.querySelector("#supplier-name");
const managerSelect = document.querySelector("#manager-select");
const exportButton = document.querySelector("#export-button");
const syncStatus = document.querySelector("#sync-status");
const toast = document.querySelector("#toast");

let board = { lebedeva: [], terekhova: [], kuznetsova: [] };
let savedBoard = structuredClone(board);
let toastTimer;
let dragState = null;

function setStatus(message, state = "") {
  syncStatus.className = `sync-status ${state}`.trim();
  syncStatus.querySelector("span:last-child").textContent = message;
}

function showError(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function escapeText(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function render() {
  for (const manager of managers) {
    const list = document.querySelector(`[data-list="${manager}"]`);
    const column = document.querySelector(`[data-manager="${manager}"]`);
    column.querySelector(".count").textContent = board[manager].length;

    if (!board[manager].length) {
      list.innerHTML = '<div class="empty-state">Пусто — перетащите сюда поставщика</div>';
      continue;
    }

    list.innerHTML = board[manager]
      .map(
        (supplier) => `
          <div class="supplier-card" data-id="${escapeText(supplier.id)}" data-manager="${manager}" tabindex="0">
            <span class="supplier-name">${escapeText(supplier.name)}</span>
            <button class="delete-button" type="button" aria-label="Удалить ${escapeText(supplier.name)}" title="Удалить">×</button>
          </div>`
      )
      .join("");
  }
}

async function loadBoard() {
  setStatus("Загрузка…");
  try {
    const response = await fetch("/board", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить доску");
    board = await response.json();
    savedBoard = structuredClone(board);
    render();
    setStatus("Все изменения сохранены", "is-saved");
  } catch (error) {
    setStatus("Нет связи с сервером", "is-error");
    showError(error.message);
  }
}

async function saveBoard() {
  setStatus("Сохранение…");
  try {
    const response = await fetch("/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board)
    });
    if (!response.ok) throw new Error("Не удалось сохранить изменения");
    savedBoard = structuredClone(board);
    setStatus("Все изменения сохранены", "is-saved");
    return true;
  } catch (error) {
    board = structuredClone(savedBoard);
    render();
    setStatus("Изменения не сохранены", "is-error");
    showError(`${error.message}. Доска возвращена к последней сохранённой версии.`);
    return false;
  }
}

function locateSupplier(id) {
  for (const manager of managers) {
    const index = board[manager].findIndex((supplier) => supplier.id === id);
    if (index !== -1) return { manager, index, supplier: board[manager][index] };
  }
  return null;
}

async function moveSupplier(id, targetManager) {
  const located = locateSupplier(id);
  if (!located || !managers.includes(targetManager) || located.manager === targetManager) return;
  board[located.manager].splice(located.index, 1);
  board[targetManager].push(located.supplier);
  render();
  await saveBoard();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const manager = managerSelect.value;
  if (!name || !managers.includes(manager)) return;

  board[manager].push({
    id: `supplier-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    name
  });
  render();
  form.querySelector("button").disabled = true;
  const saved = await saveBoard();
  form.querySelector("button").disabled = false;
  if (saved) {
    form.reset();
    nameInput.focus();
  }
});

boardElement.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const card = button.closest(".supplier-card");
  const located = locateSupplier(card.dataset.id);
  if (!located) return;
  board[located.manager].splice(located.index, 1);
  render();
  await saveBoard();
});

exportButton.addEventListener("click", () => {
  const managerNames = {
    lebedeva: "Светлана Лебедева",
    terekhova: "Светлана Терехова",
    kuznetsova: "Дарья Кузнецова"
  };
  const escapeCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [["Менеджер", "Поставщик"]];

  for (const manager of managers) {
    for (const supplier of board[manager]) {
      rows.push([managerNames[manager], supplier.name]);
    }
  }

  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `поставщики-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function clearDragVisuals() {
  document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
  document.querySelectorAll(".is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  document.querySelector(".drag-ghost")?.remove();
}

function updatePointerDrag(event) {
  if (!dragState) return;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.active && distance < 7) return;

  if (!dragState.active) {
    dragState.active = true;
    const rect = dragState.card.getBoundingClientRect();
    dragState.offsetX = event.clientX - rect.left;
    dragState.offsetY = event.clientY - rect.top;
    dragState.ghost = dragState.card.cloneNode(true);
    dragState.ghost.classList.add("drag-ghost");
    dragState.ghost.querySelector(".delete-button")?.remove();
    dragState.ghost.style.width = `${rect.width}px`;
    document.body.appendChild(dragState.ghost);
    dragState.card.classList.add("is-dragging");
  }

  event.preventDefault();
  dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;
  document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
  const beneath = document.elementFromPoint(event.clientX, event.clientY);
  beneath?.closest(".card-list")?.classList.add("is-over");
}

boardElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".delete-button")) return;
  const card = event.target.closest(".supplier-card");
  if (!card) return;
  dragState = {
    id: card.dataset.id,
    card,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false
  };
  card.setPointerCapture(event.pointerId);
});

boardElement.addEventListener("pointermove", updatePointerDrag);

async function finishPointerDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const wasActive = dragState.active;
  const id = dragState.id;
  const beneath = wasActive ? document.elementFromPoint(event.clientX, event.clientY) : null;
  const targetManager = beneath?.closest(".card-list")?.dataset.list;
  clearDragVisuals();
  dragState = null;
  if (wasActive && targetManager) await moveSupplier(id, targetManager);
}

boardElement.addEventListener("pointerup", finishPointerDrag);
boardElement.addEventListener("pointercancel", (event) => {
  if (dragState?.pointerId !== event.pointerId) return;
  clearDragVisuals();
  dragState = null;
});

loadBoard();

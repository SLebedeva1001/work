const boardElement = document.querySelector("#board");
const form = document.querySelector("#supplier-form");
const nameInput = document.querySelector("#supplier-name");
const managerSelect = document.querySelector("#manager-select");
const exportButton = document.querySelector("#export-button");
const columnButton = document.querySelector("#column-button");
const syncStatus = document.querySelector("#sync-status");
const toast = document.querySelector("#toast");
const appDialog = document.querySelector("#app-dialog");
const dialogForm = document.querySelector("#dialog-form");
const dialogTitle = document.querySelector("#dialog-title");
const dialogMessage = document.querySelector("#dialog-message");
const dialogInput = document.querySelector("#dialog-input");
const dialogManager = document.querySelector("#dialog-manager");
const dialogContract = document.querySelector("#dialog-contract");
const dialogConfirm = document.querySelector("#dialog-confirm");
const palette = ["#cf6c32", "#31695d", "#506da8", "#8a5a89", "#8b7a32", "#477785"];
const supplierCollator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

let board = { columns: [] };
let savedBoard = structuredClone(board);
let toastTimer;
let dragState = null;

function askText(title, value = "", message = "") {
  return new Promise((resolve) => {
    appDialog.className = "app-dialog";
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogInput.value = value;
    dialogConfirm.textContent = "Сохранить";
    dialogConfirm.className = "dialog-confirm";
    appDialog.showModal();
    dialogInput.focus();
    dialogInput.select();
    appDialog.addEventListener("close", () => {
      resolve(appDialog.returnValue === "confirm" ? dialogInput.value.trim() : "");
    }, { once: true });
  });
}

function askConfirm(title, message) {
  return new Promise((resolve) => {
    appDialog.className = "app-dialog is-confirm";
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogConfirm.textContent = "Удалить";
    dialogConfirm.className = "dialog-confirm is-danger";
    appDialog.showModal();
    appDialog.addEventListener("close", () => {
      resolve(appDialog.returnValue === "confirm");
    }, { once: true });
  });
}

function askSupplierEdit(located) {
  return new Promise((resolve) => {
    appDialog.className = "app-dialog is-supplier-edit";
    dialogTitle.textContent = "Редактировать поставщика";
    dialogMessage.textContent = "Здесь можно изменить название, контракт и передать карточку другому менеджеру.";
    dialogInput.value = located.supplier.name;
    dialogManager.innerHTML = board.columns
      .map((column) => `<option value="${escapeText(column.id)}">${escapeText(column.name)}</option>`)
      .join("");
    dialogManager.value = located.column.id;
    dialogContract.checked = Boolean(located.supplier.contract);
    dialogConfirm.textContent = "Сохранить";
    dialogConfirm.className = "dialog-confirm";
    appDialog.showModal();
    dialogInput.focus();
    dialogInput.select();
    appDialog.addEventListener("close", () => {
      resolve(appDialog.returnValue === "confirm"
        ? {
            name: dialogInput.value.trim(),
            columnId: dialogManager.value,
            contract: dialogContract.checked
          }
        : null);
    }, { once: true });
  });
}

dialogForm.addEventListener("submit", (event) => {
  if (!appDialog.classList.contains("is-confirm") && !dialogInput.value.trim()) {
    event.preventDefault();
    dialogInput.focus();
  }
});

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

function renderManagerOptions() {
  const selected = managerSelect.value;
  managerSelect.innerHTML = board.columns
    .map((column) => `<option value="${escapeText(column.id)}">${escapeText(column.name)}</option>`)
    .join("");
  if (board.columns.some((column) => column.id === selected)) managerSelect.value = selected;
}

function render() {
  board.columns.forEach((column) => {
    column.suppliers.sort((left, right) => supplierCollator.compare(left.name, right.name));
  });
  renderManagerOptions();
  form.querySelector(".add-button").disabled = board.columns.length === 0;

  boardElement.innerHTML = board.columns
    .map((column) => {
      const cards = column.suppliers.length
        ? column.suppliers
            .map(
              (supplier) => `
                <div class="supplier-card" data-id="${escapeText(supplier.id)}" data-column="${escapeText(column.id)}" tabindex="0">
                  <span class="supplier-name">${escapeText(supplier.name)}</span>
                  <span class="card-actions">
                    <label class="contract-mark" title="Контракт">
                      <input class="contract-checkbox" type="checkbox" ${supplier.contract ? "checked" : ""} aria-label="Контракт с ${escapeText(supplier.name)}" />
                      <span aria-hidden="true">К</span>
                    </label>
                    <button class="edit-button" type="button" aria-label="Изменить ${escapeText(supplier.name)}" title="Изменить">✎</button>
                    <button class="delete-button" type="button" aria-label="Удалить ${escapeText(supplier.name)}" title="Удалить">×</button>
                  </span>
                </div>`
            )
            .join("")
        : '<div class="empty-state">Пусто — перетащите сюда поставщика</div>';

      return `
        <article class="column" data-column="${escapeText(column.id)}" style="--column-color:${escapeText(column.color)}">
          <header class="column-header">
            <h2>${escapeText(column.name)}</h2>
            <span class="column-header-actions">
              <span class="count" aria-label="Количество поставщиков">${column.suppliers.length}</span>
              <button class="delete-column-button" type="button" aria-label="Удалить колонку ${escapeText(column.name)}" title="Удалить колонку">×</button>
            </span>
          </header>
          <div class="card-list" data-list="${escapeText(column.id)}">${cards}</div>
        </article>`;
    })
    .join("");
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
  for (const column of board.columns) {
    const index = column.suppliers.findIndex((supplier) => supplier.id === id);
    if (index !== -1) return { column, index, supplier: column.suppliers[index] };
  }
  return null;
}

async function moveSupplier(id, targetColumnId) {
  const located = locateSupplier(id);
  const target = board.columns.find((column) => column.id === targetColumnId);
  if (!located || !target || located.column.id === target.id) return;
  located.column.suppliers.splice(located.index, 1);
  target.suppliers.push(located.supplier);
  render();
  await saveBoard();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const column = board.columns.find((item) => item.id === managerSelect.value);
  if (!name || !column) return;
  column.suppliers.push({ id: `supplier-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, name, contract: false });
  render();
  const saved = await saveBoard();
  if (saved) {
    nameInput.value = "";
    nameInput.focus();
  }
});

columnButton.addEventListener("click", async () => {
  const name = await askText("Новая колонка", "", "Введите имя менеджера или название группы.");
  if (!name) return;
  board.columns.push({
    id: `column-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    name: name.slice(0, 80),
    color: palette[board.columns.length % palette.length],
    suppliers: []
  });
  render();
  managerSelect.value = board.columns.at(-1).id;
  await saveBoard();
});

boardElement.addEventListener("click", async (event) => {
  const columnDelete = event.target.closest(".delete-column-button");
  if (columnDelete) {
    const columnElement = columnDelete.closest(".column");
    const column = board.columns.find((item) => item.id === columnElement.dataset.column);
    if (!column) return;
    const warning = column.suppliers.length
      ? `Удалить колонку «${column.name}» и ${column.suppliers.length} карточек?`
      : `Удалить пустую колонку «${column.name}»?`;
    if (!await askConfirm("Удалить колонку?", warning)) return;
    board.columns = board.columns.filter((item) => item.id !== column.id);
    render();
    await saveBoard();
    return;
  }

  const editButton = event.target.closest(".edit-button");
  if (editButton) {
    const located = locateSupplier(editButton.closest(".supplier-card").dataset.id);
    if (!located) return;
    const edited = await askSupplierEdit(located);
    if (!edited) return;
    const targetColumn = board.columns.find((column) => column.id === edited.columnId);
    if (!targetColumn) return;
    located.supplier.name = edited.name.slice(0, 160);
    located.supplier.contract = edited.contract;
    if (targetColumn.id !== located.column.id) {
      located.column.suppliers.splice(located.index, 1);
      targetColumn.suppliers.push(located.supplier);
    }
    render();
    await saveBoard();
    return;
  }

  const deleteButton = event.target.closest(".delete-button");
  if (!deleteButton) return;
  const located = locateSupplier(deleteButton.closest(".supplier-card").dataset.id);
  if (!located) return;
  located.column.suppliers.splice(located.index, 1);
  render();
  await saveBoard();
});

exportButton.addEventListener("click", () => {
  const escapeCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [board.columns.map((column) => column.name)];
  const longestColumn = Math.max(0, ...board.columns.map((column) => column.suppliers.length));
  for (let index = 0; index < longestColumn; index += 1) {
    rows.push(board.columns.map((column) => column.suppliers[index]?.name || ""));
  }
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `поставщики-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

boardElement.addEventListener("change", async (event) => {
  const checkbox = event.target.closest(".contract-checkbox");
  if (!checkbox) return;
  const located = locateSupplier(checkbox.closest(".supplier-card").dataset.id);
  if (!located) return;
  located.supplier.contract = checkbox.checked;
  await saveBoard();
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
    dragState.ghost.querySelector(".card-actions")?.remove();
    dragState.ghost.style.width = `${rect.width}px`;
    document.body.appendChild(dragState.ghost);
    dragState.card.classList.add("is-dragging");
  }
  event.preventDefault();
  dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;
  document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
  document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest(".column")
    ?.querySelector(".card-list")
    ?.classList.add("is-over");
}

boardElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("button, input, label")) return;
  const card = event.target.closest(".supplier-card");
  if (!card) return;
  dragState = { id: card.dataset.id, card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
  card.setPointerCapture(event.pointerId);
});

boardElement.addEventListener("pointermove", updatePointerDrag);
boardElement.addEventListener("pointerup", async (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const wasActive = dragState.active;
  const id = dragState.id;
  const targetColumn = wasActive
    ? document.elementFromPoint(event.clientX, event.clientY)?.closest(".column")?.dataset.column
    : null;
  clearDragVisuals();
  dragState = null;
  if (wasActive && targetColumn) await moveSupplier(id, targetColumn);
});
boardElement.addEventListener("pointercancel", (event) => {
  if (dragState?.pointerId !== event.pointerId) return;
  clearDragVisuals();
  dragState = null;
});

loadBoard();

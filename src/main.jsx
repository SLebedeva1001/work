import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { acceptTokenFromUrl, api, getToken, id, needsPassword, passwordWasSet, setToken } from "./api";
import "./styles.css";

const STATUSES = ["Новая", "В процессе", "Ожидание", "Выполнено", "Отменено"];
const ACTIVE_STATUSES = new Set(["Новая", "В процессе", "Ожидание"]);
const COLORS = ["#d96c3f", "#2f766d", "#526fa8", "#9c5d91", "#ad7b23", "#637056", "#77589b"];
const collator = new Intl.Collator("ru", { sensitivity: "base" });

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", includeTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function daysInWork(task) {
  const end = task.completedAt ? new Date(task.completedAt) : new Date();
  return Math.max(1, Math.floor((end - new Date(task.createdAt)) / 86400000) + 1);
}

function EmployeeChip({ employee, faded = false }) {
  if (!employee) return null;
  return <span className={`employee-chip ${faded ? "faded" : ""}`} style={{ "--chip": employee.color }}>{employee.name}</span>;
}

function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></header>
      {children}
    </section>
  </div>;
}

function Login({ onReady }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("s.vento85@gmail.com");
  const [name, setName] = useState("Светлана Лебедева");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (mode === "bootstrap") {
        await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify({ email, password, name }) });
      }
      const session = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setToken(session.access_token); onReady();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="brand-mark">BT</div>
      <p className="eyebrow">BABY TREND · ЗАКУПКИ</p>
      <h1>{mode === "login" ? "Вход в рабочее пространство" : "Первоначальная настройка"}</h1>
      <p className="muted">Задачи команды и единый справочник поставщиков.</p>
      <form onSubmit={submit} className="stack-form">
        {mode === "bootstrap" && <label>Имя и фамилия<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
        <label>Электронная почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength="8" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Подождите…" : mode === "login" ? "Войти" : "Создать администратора"}</button>
      </form>
      <button className="link-button" onClick={() => { setMode(mode === "login" ? "bootstrap" : "login"); setError(""); }}>
        {mode === "login" ? "Первый вход администратора" : "Вернуться ко входу"}
      </button>
    </section>
  </main>;
}

function PasswordSetup({ onReady }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (password !== repeat) return setError("Пароли не совпадают");
    try { await api("/api/auth/password", { method: "PUT", body: JSON.stringify({ password }) }); passwordWasSet(); onReady(); }
    catch (err) { setError(err.message); }
  }
  return <main className="login-page"><section className="login-card"><div className="brand-mark">BT</div><p className="eyebrow">ПРИГЛАШЕНИЕ В КОМАНДУ</p><h1>Придумайте пароль</h1><p className="muted">Он будет храниться в защищённом виде в Supabase.</p>
    <form className="stack-form" onSubmit={submit}><label>Новый пароль<input type="password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><label>Повторите пароль<input type="password" minLength="8" value={repeat} onChange={(e) => setRepeat(e.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<button className="primary">Сохранить пароль</button></form></section></main>;
}

function TaskForm({ employees, task, onSave, onClose }) {
  const [title, setTitle] = useState(task?.title || "");
  const [status, setStatus] = useState(task?.status || "Новая");
  const [assigneeIds, setAssignees] = useState(task?.assigneeIds || []);
  const [error, setError] = useState("");
  function toggle(employeeId) { setAssignees((items) => items.includes(employeeId) ? items.filter((item) => item !== employeeId) : [...items, employeeId]); }
  return <Modal title={task ? "Редактировать задачу" : "Новая задача"} onClose={onClose}>
    <form className="stack-form" onSubmit={(event) => { event.preventDefault(); if (!assigneeIds.length) return setError("Выберите хотя бы одного исполнителя"); onSave({ title: title.trim(), status, assigneeIds }); }}>
      <label>Название задачи<textarea rows="3" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></label>
      <label>Статус<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <fieldset><legend>Текущие исполнители</legend><div className="check-grid">
        {employees.filter((employee) => employee.active).map((employee) => <label className="check-person" key={employee.id}>
          <input type="checkbox" checked={assigneeIds.includes(employee.id)} onChange={() => toggle(employee.id)} />
          <EmployeeChip employee={employee} />
        </label>)}
      </div></fieldset>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">Сохранить</button></div>
    </form>
  </Modal>;
}

function TaskCard({ task, employees, currentEmployee, mutate }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [update, setUpdate] = useState("");
  const employee = (employeeId) => employees.find((item) => item.id === employeeId);
  const updates = [...(task.updates || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const last = updates[0];

  function saveTask(values) {
    mutate((workspace) => {
      const target = workspace.tasks.find((item) => item.id === task.id);
      const previous = target.assigneeIds || [];
      target.title = values.title; target.status = values.status; target.assigneeIds = values.assigneeIds;
      target.updatedAt = new Date().toISOString();
      target.participantIds = [...new Set([...(target.participantIds || []), ...values.assigneeIds])];
      target.completedAt = ACTIVE_STATUSES.has(values.status) ? null : (target.completedAt || new Date().toISOString());
      const added = values.assigneeIds.filter((item) => !previous.includes(item)).map((item) => employee(item)?.name).filter(Boolean);
      const removed = previous.filter((item) => !values.assigneeIds.includes(item)).map((item) => employee(item)?.name).filter(Boolean);
      if (added.length || removed.length || values.status !== task.status) target.updates.push({ id: id("event"), kind: "system",
        text: [added.length ? `Подключились: ${added.join(", ")}` : "", removed.length ? `Завершили участие: ${removed.join(", ")}` : "",
          values.status !== task.status ? `Статус: ${values.status}` : ""].filter(Boolean).join(" · "), createdAt: new Date().toISOString(), authorEmployeeId: currentEmployee?.id || "" });
    });
    setEditing(false);
  }

  function addUpdate(event) {
    event.preventDefault();
    if (!update.trim()) return;
    mutate((workspace) => { const target = workspace.tasks.find((item) => item.id === task.id); target.updatedAt = new Date().toISOString(); target.updates.push({
      id: id("update"), kind: "progress", text: update.trim(), createdAt: new Date().toISOString(), authorEmployeeId: currentEmployee?.id || ""
    }); });
    setUpdate(""); setOpen(true);
  }

  return <article className={`task-card status-${task.status.replaceAll(" ", "-").toLowerCase()}`}>
    <button className="task-summary" onClick={() => setOpen(!open)}>
      <span className="task-main"><strong>{task.title}</strong><span className="chips">{task.assigneeIds.map((item) => <EmployeeChip key={item} employee={employee(item)} />)}</span></span>
      <span className="status-pill">{task.status}</span>
      <span className="days">{daysInWork(task)} дн.</span>
      <span className="last-update">{last ? <><b>{last.text}</b><small>{employee(last.authorEmployeeId)?.name || "Система"} · {formatDate(last.createdAt)}</small></> : <em>Обновлений пока нет</em>}</span>
      <span className="chevron">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="task-details">
      <div className="task-meta"><span>Создана {formatDate(task.createdAt)}</span><span>Начал: {employee(task.createdBy)?.name || "—"}</span>
        <button className="secondary small" onClick={() => setEditing(true)}>Редактировать</button></div>
      {ACTIVE_STATUSES.has(task.status) && <form className="quick-update" onSubmit={addUpdate}>
        <input value={update} onChange={(e) => setUpdate(e.target.value)} placeholder="Что изменилось сегодня?" /><button className="primary">Добавить обновление</button>
      </form>}
      <div className="timeline">{updates.length ? updates.map((item) => <div className={`timeline-item ${item.kind}`} key={item.id}>
        <span className="timeline-dot" /><div><p>{item.text}</p><small>{employee(item.authorEmployeeId)?.name || "Система"} · {formatDate(item.createdAt, true)}</small></div>
      </div>) : <p className="empty">История пока пуста</p>}</div>
    </div>}
    {editing && <TaskForm employees={employees} task={task} onSave={saveTask} onClose={() => setEditing(false)} />}
  </article>;
}

function TasksPage({ workspace, currentEmployee, mutate }) {
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [archive, setArchive] = useState(false);
  const [adding, setAdding] = useState(false);
  const tasks = workspace.tasks.filter((task) => (archive ? !ACTIVE_STATUSES.has(task.status) : ACTIVE_STATUSES.has(task.status)) &&
    (employeeFilter === "all" || task.assigneeIds.includes(employeeFilter)) && (statusFilter === "all" || task.status === statusFilter))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  function createTask(values) {
    mutate((draft) => draft.tasks.push({ id: id("task"), title: values.title, status: values.status,
      assigneeIds: values.assigneeIds, participantIds: values.assigneeIds, createdBy: currentEmployee?.id || "",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: ACTIVE_STATUSES.has(values.status) ? null : new Date().toISOString(),
      updates: [{ id: id("event"), kind: "system", text: "Задача создана", createdAt: new Date().toISOString(), authorEmployeeId: currentEmployee?.id || "" }] }));
    setAdding(false);
  }

  return <section className="page-content">
    <div className="section-heading"><div><p className="eyebrow">РАБОТА КОМАНДЫ</p><h1>{archive ? "Архив задач" : "Активные задачи"}</h1></div>
      <button className="primary" onClick={() => setAdding(true)}>+ Новая задача</button></div>
    <div className="toolbar">
      <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}><option value="all">Все сотрудники</option>{workspace.employees.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Все статусы</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
      <div className="segmented"><button className={!archive ? "active" : ""} onClick={() => setArchive(false)}>Активные</button><button className={archive ? "active" : ""} onClick={() => setArchive(true)}>Архив</button></div>
      <span className="result-count">{tasks.length} задач</span>
    </div>
    <div className="task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} employees={workspace.employees} currentEmployee={currentEmployee} mutate={mutate} />)}
      {!tasks.length && <div className="empty-panel"><h3>Здесь пока нет задач</h3><p>Создайте новую задачу или измените фильтры.</p></div>}</div>
    {adding && <TaskForm employees={workspace.employees} onSave={createTask} onClose={() => setAdding(false)} />}
  </section>;
}

function SupplierForm({ supplier, employees, onSave, onClose }) {
  const [form, setForm] = useState(supplier || { name: "", ownerEmployeeId: "", active: true, contract: false,
    deliveryTerms: "", paymentDeferral: "", categories: [], brands: [], contacts: [], notes: "" });
  const field = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const contactsText = (form.contacts || []).map((item) => [item.name, item.phone, item.email].filter(Boolean).join(" | ")).join("\n");
  return <Modal title={supplier ? "Карточка поставщика" : "Новый поставщик"} onClose={onClose} wide>
    <form className="supplier-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
      <label className="span-2">Название поставщика<input value={form.name} onChange={(e) => field("name", e.target.value)} required autoFocus /></label>
      <label>Ответственный закупщик<select value={form.ownerEmployeeId} onChange={(e) => field("ownerEmployeeId", e.target.value)}><option value="">Не назначен</option>{employees.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Статус<select value={form.active ? "active" : "inactive"} onChange={(e) => field("active", e.target.value === "active")}><option value="active">Работаем</option><option value="inactive">Не работаем</option></select></label>
      <label className="span-2 check-line"><input type="checkbox" checked={form.contract} onChange={(e) => field("contract", e.target.checked)} /> Есть контракт</label>
      <label>Условия доставки<textarea rows="3" value={form.deliveryTerms} onChange={(e) => field("deliveryTerms", e.target.value)} placeholder="Минимальная сумма, сроки, регион…" /></label>
      <label>Отсрочка платежа<textarea rows="3" value={form.paymentDeferral} onChange={(e) => field("paymentDeferral", e.target.value)} placeholder="Например: 30 календарных дней" /></label>
      <label>Категории товаров<input value={(form.categories || []).join(", ")} onChange={(e) => field("categories", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="Бытовая химия, гигиена…" /></label>
      <label>Бренды<input value={(form.brands || []).join(", ")} onChange={(e) => field("brands", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="Каждый бренд через запятую" /></label>
      <label className="span-2">Контакты<textarea rows="4" value={contactsText} onChange={(e) => field("contacts", e.target.value.split("\n").filter(Boolean).map((line) => { const [name = "", phone = "", email = ""] = line.split("|").map((x) => x.trim()); return { name, phone, email }; }))} placeholder="Имя | телефон | email — каждый контакт с новой строки" /></label>
      <label className="span-2">Примечания<textarea rows="3" value={form.notes} onChange={(e) => field("notes", e.target.value)} /></label>
      <div className="form-actions span-2"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">Сохранить</button></div>
    </form>
  </Modal>;
}

function SuppliersPage({ workspace, mutate }) {
  const [view, setView] = useState("directory");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const employee = (id) => workspace.employees.find((item) => item.id === id);
  const suppliers = workspace.suppliers.filter((supplier) => `${supplier.name} ${(supplier.brands || []).join(" ")} ${(supplier.categories || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()) &&
    (owner === "all" || (owner === "inactive" ? !supplier.active : supplier.ownerEmployeeId === owner))).sort((a, b) => collator.compare(a.name, b.name));

  function saveSupplier(values) {
    mutate((draft) => {
      const now = new Date().toISOString();
      if (editing) Object.assign(draft.suppliers.find((item) => item.id === editing.id), values, { updatedAt: now });
      else draft.suppliers.push({ ...values, id: id("supplier"), createdAt: now, updatedAt: now });
    });
    setEditing(null); setAdding(false);
  }
  function moveSupplier(supplierId, ownerEmployeeId, active = true) {
    mutate((draft) => Object.assign(draft.suppliers.find((item) => item.id === supplierId), { ownerEmployeeId, active, updatedAt: new Date().toISOString() }));
  }
  const columns = [...workspace.employees.filter((item) => item.active).sort((a, b) => collator.compare(a.name, b.name)), { id: "inactive", name: "Не работаем", color: "#777" }];

  return <section className="page-content">
    <div className="section-heading"><div><p className="eyebrow">ЕДИНЫЙ СПРАВОЧНИК</p><h1>Поставщики</h1></div><button className="primary" onClick={() => setAdding(true)}>+ Поставщик</button></div>
    <div className="toolbar"><input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по названию, бренду или категории" />
      <select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="all">Все закупщики</option>{workspace.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="inactive">Не работаем</option></select>
      <div className="segmented"><button className={view === "directory" ? "active" : ""} onClick={() => setView("directory")}>Справочник</button><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Доска</button></div>
      <span className="result-count">{suppliers.length} поставщиков</span></div>
    {view === "directory" ? <div className="supplier-table-wrap"><table className="supplier-table"><thead><tr><th>Поставщик</th><th>Закупщик</th><th>Категории и бренды</th><th>Доставка</th><th>Отсрочка</th><th>Контакты</th></tr></thead>
      <tbody>{suppliers.map((supplier) => <tr key={supplier.id} onClick={() => setEditing(supplier)}><td><strong>{supplier.name}</strong><div>{supplier.contract && <span className="contract-badge">К</span>}{!supplier.active && <span className="inactive-badge">Не работаем</span>}</div></td>
        <td><EmployeeChip employee={employee(supplier.ownerEmployeeId)} /></td><td><div className="tag-line">{supplier.categories?.map((item) => <span key={item}>{item}</span>)}</div><small>{supplier.brands?.join(", ") || "—"}</small></td>
        <td>{supplier.deliveryTerms || "—"}</td><td>{supplier.paymentDeferral || "—"}</td><td>{supplier.contacts?.length ? supplier.contacts.map((item, index) => <small className="contact" key={index}>{[item.name, item.phone, item.email].filter(Boolean).join(" · ")}</small>) : "—"}</td></tr>)}</tbody></table></div>
      : <div className="supplier-board">{columns.map((column) => { const items = suppliers.filter((item) => column.id === "inactive" ? !item.active : item.active && item.ownerEmployeeId === column.id); return <section className="supplier-column" key={column.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveSupplier(e.dataTransfer.getData("text/plain"), column.id === "inactive" ? "" : column.id, column.id !== "inactive")}>
        <header style={{ borderColor: column.color }}><h3>{column.name}</h3><span>{items.length}</span></header><div className="supplier-column-body">{items.map((supplier) => <button draggable className="supplier-card" key={supplier.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", supplier.id)} onClick={() => setEditing(supplier)}><span>{supplier.name}</span>{supplier.contract && <b>К</b>}</button>)}{!items.length && <p className="drop-hint">Пусто — перенесите сюда поставщика</p>}</div></section>; })}</div>}
    {(adding || editing) && <SupplierForm supplier={editing} employees={workspace.employees} onSave={saveSupplier} onClose={() => { setEditing(null); setAdding(false); }} />}
  </section>;
}

function EmployeeForm({ employee, onSave, onClose }) {
  const [form, setForm] = useState(employee || { name: "", email: "", color: COLORS[0], active: true, role: "member" });
  const field = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <Modal title={employee ? "Сотрудник" : "Новый сотрудник"} onClose={onClose}><form className="stack-form" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
    <label>Имя и фамилия<input value={form.name} onChange={(e) => field("name", e.target.value)} required /></label>
    <label>Электронная почта<input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} /></label>
    <label>Цвет<input type="color" value={form.color} onChange={(e) => field("color", e.target.value)} /></label>
    <label>Роль<select value={form.role} onChange={(e) => field("role", e.target.value)}><option value="member">Сотрудник</option><option value="admin">Администратор</option></select></label>
    <label className="check-line"><input type="checkbox" checked={form.active} onChange={(e) => field("active", e.target.checked)} /> Работает в команде</label>
    <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">Сохранить</button></div>
  </form></Modal>;
}

function EmployeesPage({ workspace, mutate, admin }) {
  const [editing, setEditing] = useState(null); const [adding, setAdding] = useState(false); const [message, setMessage] = useState("");
  function save(values) {
    mutate((draft) => { if (editing) Object.assign(draft.employees.find((item) => item.id === editing.id), values);
      else draft.employees.push({ ...values, id: id("employee"), userId: "" }); });
    setEditing(null); setAdding(false);
  }
  async function invite(employee) {
    if (!employee.email) return setMessage("Сначала укажите почту сотрудника.");
    try { await api("/api/admin/invite", { method: "POST", body: JSON.stringify({ email: employee.email, name: employee.name }) }); setMessage(`Приглашение отправлено: ${employee.email}`); }
    catch (error) { setMessage(error.message); }
  }
  return <section className="page-content"><div className="section-heading"><div><p className="eyebrow">КОМАНДА</p><h1>Сотрудники</h1></div>{admin && <button className="primary" onClick={() => setAdding(true)}>+ Сотрудник</button>}</div>
    {message && <div className="notice">{message}</div>}<div className="employee-grid">{[...workspace.employees].sort((a, b) => collator.compare(a.name, b.name)).map((employee) => {
      const activeTasks = workspace.tasks.filter((task) => ACTIVE_STATUSES.has(task.status) && task.assigneeIds.includes(employee.id)).length;
      return <article className={`employee-card ${!employee.active ? "disabled" : ""}`} key={employee.id}><div className="avatar" style={{ background: employee.color }}>{employee.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div><div><h3>{employee.name}</h3><p>{employee.email || "Почта не указана"}</p><strong>{activeTasks} активных задач</strong></div>
        <div className="employee-actions">{admin && <><button className="secondary small" onClick={() => setEditing(employee)}>Изменить</button>{employee.email && !employee.userId && <button className="secondary small" onClick={() => invite(employee)}>Пригласить</button>}</>}</div></article>; })}</div>
    {(adding || editing) && <EmployeeForm employee={editing} onSave={save} onClose={() => { setEditing(null); setAdding(false); }} />}</section>;
}

function App() {
  const [sessionReady, setSessionReady] = useState(Boolean(acceptTokenFromUrl() || getToken()));
  const [passwordSetup, setPasswordSetup] = useState(needsPassword());
  const [workspace, setWorkspace] = useState(null); const [me, setMe] = useState(null); const [page, setPage] = useState("tasks");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);

  async function load() {
    if (!getToken()) return setSessionReady(false);
    try { const [profile, data] = await Promise.all([api("/api/auth/me"), api("/api/workspace")]); setMe(profile); setWorkspace(data); setSessionReady(true); setError(""); }
    catch (err) { if (err.status === 401) { setToken(""); setSessionReady(false); } else setError(err.message); }
  }
  useEffect(() => { if (sessionReady) load(); }, [sessionReady]);

  async function mutate(change) {
    if (saving) return;
    const draft = structuredClone(workspace); change(draft); setSaving(true); setError("");
    try { const saved = await api("/api/workspace", { method: "PUT", body: JSON.stringify(draft) }); setWorkspace(saved); }
    catch (err) { setError(err.message); if (err.status === 409) await load(); }
    finally { setSaving(false); }
  }
  function logout() { setToken(""); setWorkspace(null); setMe(null); setSessionReady(false); }
  if (passwordSetup) return <PasswordSetup onReady={() => { setPasswordSetup(false); setSessionReady(true); }} />;
  if (!sessionReady) return <Login onReady={() => setSessionReady(true)} />;
  if (!workspace) return <main className="loading"><div className="spinner" /><p>{error || "Загружаем рабочее пространство…"}</p>{error && <button className="secondary" onClick={load}>Повторить</button>}</main>;

  const currentEmployee = me?.employee || workspace.employees.find((item) => item.email?.toLowerCase() === me?.user?.email?.toLowerCase());
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span>BT</span><div><strong>Baby Trend</strong><small>Рабочее пространство</small></div></div>
    <nav><button className={page === "tasks" ? "active" : ""} onClick={() => setPage("tasks")}><span>✓</span> Задачи</button><button className={page === "suppliers" ? "active" : ""} onClick={() => setPage("suppliers")}><span>▦</span> Поставщики</button><button className={page === "employees" ? "active" : ""} onClick={() => setPage("employees")}><span>●</span> Сотрудники</button></nav>
    <div className="sidebar-user"><EmployeeChip employee={currentEmployee} /><small>{me?.user?.email}</small><button onClick={logout}>Выйти</button></div></aside>
    <main className="main-area">{error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}{saving && <div className="saving">Сохраняем…</div>}
      {page === "tasks" && <TasksPage workspace={workspace} currentEmployee={currentEmployee} mutate={mutate} />}
      {page === "suppliers" && <SuppliersPage workspace={workspace} mutate={mutate} />}
      {page === "employees" && <EmployeesPage workspace={workspace} mutate={mutate} admin={me?.isAdmin} />}</main>
    <nav className="mobile-nav"><button className={page === "tasks" ? "active" : ""} onClick={() => setPage("tasks")}>✓<small>Задачи</small></button><button className={page === "suppliers" ? "active" : ""} onClick={() => setPage("suppliers")}>▦<small>Поставщики</small></button><button className={page === "employees" ? "active" : ""} onClick={() => setPage("employees")}>●<small>Команда</small></button></nav>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);

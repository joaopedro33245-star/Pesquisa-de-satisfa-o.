// ─── Estado Global ────────────────────────────────────────────────────────────
const App = {
  page:            'dashboard',
  deliveries:      [],
  satisfactions:   [],
  sacAtendimentos: [],
  toggles:         {},
  importRows:      [],
  entregaSel:      null,
  currentUser:     null,   // auth.users
  currentProfile:  null,   // profiles
  menuAberto:      false,
  _relFiltrado:    [],
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();

  // Ouvir mudanças de autenticação
  AuthService.onAuthChange(async (event, session) => {
    if (session) {
      App.currentUser    = session.user;
      App.currentProfile = await AuthService.getProfile(session.user.id);
      renderApp();
    } else {
      App.currentUser    = null;
      App.currentProfile = null;
      renderLogin();
    }
  });
});

// ─── Render raiz ──────────────────────────────────────────────────────────────
function renderApp() {
  document.body.innerHTML = `
    <div id="loader" class="on"><div class="spinner"></div></div>
    <div class="app" id="app-root">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="brand-icon">📋</div>
          <div class="brand-name">SatisfazTech</div>
          <div class="brand-sub">Pesquisa Pós-Entrega</div>
        </div>
        <nav class="sidebar-nav" id="nav"></nav>
        <div class="sidebar-footer">v2.0 · Powered by Supabase</div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-left">
            <h2 id="ttl">Dashboard</h2>
            <p id="sub">Carregando…</p>
          </div>
          <div class="topbar-right" style="position:relative">
            <button class="btn btn-ghost btn-sm" onclick="goto(App.page)">🔄</button>
            <div class="user-chip" onclick="toggleUserMenu()">
              <div class="user-avatar">${(App.currentProfile?.nome||'U')[0].toUpperCase()}</div>
              <span>${App.currentProfile?.nome || App.currentUser?.email}</span>
              <span class="perfil-badge perfil-${App.currentProfile?.perfil||'operador'}">${(App.currentProfile?.perfil||'operador').toUpperCase()}</span>
            </div>
            <div class="user-menu-dropdown" id="user-menu" style="display:none">
              <div class="user-menu-item" onclick="closeUserMenu()">
                <span>👤</span><span>${App.currentUser?.email}</span>
              </div>
              <hr style="border-color:var(--border);margin:6px 0">
              <button class="user-menu-item danger" onclick="fazerLogout()">
                <span>🚪</span><span>Sair</span>
              </button>
            </div>
          </div>
        </header>
        <div class="page" id="page"></div>
      </main>
    </div>`;

  buildNav();
  goto('dashboard');
  document.addEventListener('click', e => {
    if (!e.target.closest('.user-chip') && !e.target.closest('#user-menu')) closeUserMenu();
  });
}

// ─── Navegação ────────────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.getElementById('nav');
  const items = [
    { id:'dashboard',  icon:'📊', label:'Dashboard' },
    { id:'entregas',   icon:'📦', label:'Entregas' },
    { id:'pesquisa',   icon:'📋', label:'Pesquisa', badge:'badge-pend' },
    { id:'sac',        icon:'🆘', label:'SAC',      badge:'badge-sac', urgent:true },
    { id:'relatorios', icon:'📈', label:'Relatórios' },
  ];
  nav.innerHTML = `<div class="nav-label">Menu Principal</div>` +
    items.map(i => `
      <button class="nav-item" data-p="${i.id}" onclick="goto('${i.id}')">
        <span class="nav-icon">${i.icon}</span>
        <span>${i.label}</span>
        ${i.badge ? `<span class="nav-badge ${i.urgent?'nav-badge-red':''}" id="${i.badge}" style="display:none">0</span>` : ''}
      </button>`).join('');
}

async function goto(page) {
  App.page = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.p === page));
  const titles = {
    dashboard:  ['📊 Dashboard',   'Visão geral das pesquisas'],
    entregas:   ['📦 Entregas',    'Gerenciar entregas e serviços concluídos'],
    pesquisa:   ['📋 Pesquisa',    'Registrar pesquisa de satisfação pós-entrega'],
    sac:        ['🆘 SAC',         'Atendimento de clientes com nota abaixo de 8'],
    relatorios: ['📈 Relatórios',  'Análise de desempenho e exportação'],
  };
  const [t, s] = titles[page] || ['',''];
  qs('#ttl').textContent = t;
  qs('#sub').textContent = s;
  load(true);
  try {
    const pg = qs('#page');
    if (page === 'dashboard')  await pageDashboard(pg);
    if (page === 'entregas')   await pageEntregas(pg);
    if (page === 'pesquisa')   await pagePesquisa(pg);
    if (page === 'sac')        await pageSac(pg);
    if (page === 'relatorios') await pageRelatorios(pg);
    await atualizarBadges();
  } catch(e) {
    qs('#page').innerHTML = err(e.message);
  } finally { load(false); }
}

async function atualizarBadges() {
  try {
    const [pend, sacStats] = await Promise.all([
      getDeliveries({ status:'pendente' }),
      SacService.getStats(),
    ]);
    const bp = qs('#badge-pend');
    if (bp) { bp.textContent = pend.length; bp.style.display = pend.length > 0 ? '' : 'none'; }
    const bs = qs('#badge-sac');
    const sacPend = sacStats.pendentes + sacStats.vencidos;
    if (bs) { bs.textContent = sacPend; bs.style.display = sacPend > 0 ? '' : 'none'; }
  } catch {}
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function pageDashboard(el) {
  const [stats, sacStats, sats] = await Promise.all([
    getDashboardStats(),
    SacService.getStats(),
    getSatisfactions(),
  ]);

  // Distribuição de notas
  const distNotas = [0,0,0,0,0,0,0,0,0,0,0];
  sats.filter(s=>s.nota_atendimento!=null).forEach(s => distNotas[s.nota_atendimento]++);
  const maxDist = Math.max(...distNotas, 1);
  const pctSat  = sats.length > 0
    ? ((sats.filter(s=>s.nota_atendimento>=8).length / sats.length)*100).toFixed(0) : 0;
  const pctSac  = sats.length > 0
    ? ((sats.filter(s=>s.enviado_para_sac).length / sats.length)*100).toFixed(0) : 0;

  el.innerHTML = `
    <!-- KPIs Satisfação -->
    <div class="sec-title">Pesquisas de Satisfação</div>
    <div class="kpi-grid mb20">
      ${kpi('blue',  '📦','Total Entregas',     stats.totalEntregas, 'cadastradas')}
      ${kpi('amber', '⏳','Pendentes',          stats.pendentes,     'aguardando contato')}
      ${kpi('green', '✅','Respondidas',        stats.respondidas,   'pesquisas concluídas')}
      ${kpi('purple','⭐','Média Geral',        stats.mediaGeral??'—','nota de satisfação')}
      ${kpi('green', '😊','Satisfeitos (≥8)',   sats.filter(s=>s.nota_atendimento>=8).length, `${pctSat}% do total`)}
      ${kpi('red',   '😞','Insatisfeitos (<8)', sats.filter(s=>s.nota_atendimento!=null&&s.nota_atendimento<8).length, `${pctSac}% → SAC`)}
    </div>

    <!-- KPIs SAC -->
    <div class="sec-title">SAC</div>
    <div class="kpi-grid mb20">
      ${kpi('red',   '🚨','Pendentes SAC',      sacStats.pendentes,      'aguardando')}
      ${kpi('amber', '🔄','Em Atendimento',     sacStats.em_atendimento, 'em andamento')}
      ${kpi('purple','📞','Aguard. Retorno',    sacStats.aguardando_retorno,'agendados')}
      ${kpi('green', '✅','Resolvidos',         sacStats.resolvidos,     'casos concluídos')}
      ${sacStats.vencidos > 0 ? kpi('red','⚡','Vencidos / Urgentes',sacStats.vencidos,'retornos em atraso') : ''}
    </div>

    <div class="g2 mb20">
      <!-- Distribuição de notas -->
      <div class="card">
        <div class="card-hd"><span class="card-title">📊 Distribuição de Notas</span></div>
        ${distNotas.map((v,n)=>{
          const color = n>=9?'var(--green2)':n>=7?'var(--amber2)':n>=5?'var(--amber)':'var(--red2)';
          const pct = (v/maxDist*100).toFixed(0);
          return `<div class="flex-c gap8" style="margin-bottom:6px">
            <div style="width:20px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--text3)">${n}</div>
            <div style="flex:1;height:20px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .5s;display:flex;align-items:center;padding-left:6px">
                ${v>0?`<span style="font-size:10px;font-weight:700;color:rgba(0,0,0,.7)">${v}</span>`:''}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Rankings -->
      <div class="card">
        <div class="card-hd">
          <span class="card-title">🏆 Ranking Técnicos</span>
          <span class="muted small">${stats.rankingTecnicos.length} técnicos</span>
        </div>
        ${stats.rankingTecnicos.length===0 ? emptyState('👷','Sem dados') :
          stats.rankingTecnicos.slice(0,6).map((t,i)=>rankItem(t,i)).join('')}
      </div>
    </div>

    ${stats.retorno > 0 ? `
    <div class="card" style="border-color:rgba(139,92,246,.3)">
      <div class="card-hd">
        <span class="card-title">📞 Aguardando Retorno</span>
        <span class="retorno-tag">⚡ ${stats.retorno}</span>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Cliente</th><th>Filial</th><th>Técnico</th><th>Nota</th></tr></thead>
        <tbody>${stats.satisfactions.filter(x=>x.deseja_retorno).slice(0,5).map(x=>`
          <tr><td class="td-main">${x.nome_cliente||x.codigo_cliente||'—'}</td>
          <td>${x.filial||'—'}</td><td>${x.tecnico_responsavel||'—'}</td>
          <td>${chipNota(x.nota_atendimento)}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}
  `;
}

// ─── Entregas ─────────────────────────────────────────────────────────────────
async function pageEntregas(el) {
  const list = await getDeliveries();
  App.deliveries = list;
  const filiais  = [...new Set(list.map(d=>d.filial).filter(Boolean))].sort();
  const tecnicos = [...new Set(list.map(d=>d.tecnico_responsavel).filter(Boolean))].sort();

  el.innerHTML = `
    <div class="flex-c gap12 mb20" style="justify-content:space-between;flex-wrap:wrap">
      <span class="muted small">${list.length} entregas</span>
      <div class="flex-c gap12">
        <button class="btn btn-ghost" onclick="openImport()">⬆ Importar CSV/XLSX</button>
        <button class="btn btn-primary" onclick="openNovaEntrega()">＋ Nova Entrega</button>
      </div>
    </div>
    <div class="filters">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-ctrl" id="fe-status" onchange="filtrarEntregas()" style="min-width:140px">
          <option value="">Todos</option>
          <option>pendente</option><option>respondido</option>
          <option>nao_atendeu</option><option>remarcar</option><option>concluido</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Filial</label>
        <select class="form-ctrl" id="fe-filial" onchange="filtrarEntregas()" style="min-width:140px">
          <option value="">Todas</option>${filiais.map(f=>`<option>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Técnico</label>
        <select class="form-ctrl" id="fe-tecnico" onchange="filtrarEntregas()" style="min-width:160px">
          <option value="">Todos</option>${tecnicos.map(t=>`<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Buscar</label>
        <input class="form-ctrl" id="fe-busca" placeholder="Nome ou código…" oninput="filtrarEntregas()" style="min-width:200px" />
      </div>
    </div>
    <div class="card" style="overflow:hidden">
      <div class="tbl-wrap"><table>
        <thead><tr><th>Código</th><th>Cliente</th><th>Filial</th><th>Técnico</th><th>Tipo</th><th>Data</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="tb-ent">${list.length===0?`<tr><td colspan="8">${emptyState('📦','Nenhuma entrega','Importe ou cadastre')}</td></tr>`:list.map(rowEntrega).join('')}</tbody>
      </table></div>
    </div>`;
}

function rowEntrega(d) {
  return `<tr id="row-${d.id}">
    <td class="td-mono">${d.codigo_cliente||'—'}</td>
    <td class="td-main">${d.nome_cliente||'—'}</td>
    <td>${d.filial||'—'}</td>
    <td>${d.tecnico_responsavel||'—'}</td>
    <td>${d.tipo_servico||'—'}</td>
    <td>${fmtDate(d.data_entrega)}</td>
    <td>${badgeStatus(d.status_pesquisa)}</td>
    <td>
      ${d.status_pesquisa==='pendente'
        ?`<button class="btn btn-primary btn-sm" onclick="irParaPesquisa('${d.id}')">📋 Pesquisar</button>`
        :`<button class="btn btn-ghost btn-sm" onclick="verDetalhes('${d.id}')">👁 Ver</button>`}
    </td>
  </tr>`;
}

function filtrarEntregas() {
  const status  = val('fe-status');
  const filial  = val('fe-filial');
  const tecnico = val('fe-tecnico');
  const busca   = val('fe-busca').toLowerCase();
  qs('#tb-ent')?.querySelectorAll('tr').forEach(row => {
    const t = row.textContent.toLowerCase();
    const ok = (!status||t.includes(statusLabel(status).toLowerCase()))
      && (!filial||t.includes(filial.toLowerCase()))
      && (!tecnico||t.includes(tecnico.toLowerCase()))
      && (!busca||t.includes(busca));
    row.style.display = ok ? '' : 'none';
  });
}

// ─── Pesquisa ─────────────────────────────────────────────────────────────────
async function pagePesquisa(el) {
  const list = await getDeliveries({ status:'pendente' });
  App.deliveries = list;
  App.entregaSel = null;
  App.toggles    = {};

  el.innerHTML = `
    <div class="g2" style="align-items:start;gap:20px">
      <div>
        <div class="sec-title">Pendentes (${list.length})</div>
        <div id="lista-pend" style="display:flex;flex-direction:column;gap:8px">
          ${list.length===0
            ?`<div class="card">${emptyState('✅','Tudo em dia!','Nenhuma pesquisa pendente')}</div>`
            :list.map(d=>`
              <div class="card" id="pcard-${d.id}" style="cursor:pointer;transition:border-color .15s"
                onclick="selEntrega('${d.id}')"
                onmouseenter="this.style.borderColor='var(--blue)'"
                onmouseleave="if(!App.entregaSel||App.entregaSel.id!='${d.id}')this.style.borderColor='var(--border)'">
                <div class="flex-c gap12" style="justify-content:space-between">
                  <div>
                    <div class="bold">${d.nome_cliente||d.codigo_cliente}</div>
                    <div class="muted small mt-2">${d.filial||'—'} · ${d.tecnico_responsavel||'—'}</div>
                    <div class="muted small">${d.tipo_servico||'—'} · ${fmtDate(d.data_entrega)}</div>
                  </div>
                  ${badgeStatus(d.status_pesquisa)}
                </div>
              </div>`).join('')}
        </div>
      </div>
      <div>
        <div class="sec-title">Formulário</div>
        <div id="form-cont" class="card">${emptyState('👈','Selecione uma entrega','Clique em uma entrega à esquerda')}</div>
      </div>
    </div>`;
}

function selEntrega(id) {
  document.querySelectorAll('[id^="pcard-"]').forEach(c => {
    c.style.borderColor='var(--border)'; c.style.background='var(--card)';
  });
  const card = qs(`#pcard-${id}`);
  if (card) { card.style.borderColor='var(--blue)'; card.style.background='rgba(59,130,246,.04)'; }
  App.entregaSel = App.deliveries.find(d => String(d.id)===String(id));
  App.toggles    = {};
  renderFormPesquisa();
}

function renderFormPesquisa() {
  const d = App.entregaSel;
  qs('#form-cont').innerHTML = `
    <div style="padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--border)">
      <div class="bold">${d.nome_cliente||d.codigo_cliente}</div>
      <div class="muted small mt-2">${d.filial||'—'} · ${d.tecnico_responsavel||'—'} · ${fmtDate(d.data_entrega)}</div>
    </div>
    <form onsubmit="salvarPesquisa(event)">
      <div class="form-group">
        <label class="form-label">Contato Realizado?</label>
        <div class="toggle-row">
          <button type="button" class="tog" id="ct-sim" onclick="tog('ct','sim')">✅ Sim</button>
          <button type="button" class="tog" id="ct-nao" onclick="tog('ct','nao')">❌ Não Atendeu</button>
        </div>
      </div>
      <div id="bloco-sim" style="display:none">
        <div class="row2">
          <div class="form-group">
            <label class="form-label">Nome de Quem Atendeu</label>
            <input class="form-ctrl" id="nome-ct" placeholder="Ex: Maria Silva" />
          </div>
          <div class="form-group">
            <label class="form-label">Telefone do Cliente</label>
            <input class="form-ctrl" id="tel-ct" placeholder="(00) 00000-0000" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Data da Ligação</label>
          <input class="form-ctrl" id="dt-lig" type="date" value="${hoje()}" />
        </div>
        <div class="form-group">
          <label class="form-label">Houve Problema na Entrega?</label>
          <div class="toggle-row">
            <button type="button" class="tog" id="pr-sim" onclick="tog('pr','sim')">⚠️ Sim</button>
            <button type="button" class="tog" id="pr-nao" onclick="tog('pr','nao')">✅ Não</button>
          </div>
        </div>
        <div class="form-group" id="grp-prob" style="display:none">
          <label class="form-label">Descrição do Problema <span style="color:var(--red)">*</span></label>
          <textarea class="form-ctrl" id="desc-prob" placeholder="Descreva o problema…"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Nota do Atendimento (0 – 10)</label>
          <div class="nota-wrap">
            <input type="range" id="nota-sl" min="0" max="10" value="8" oninput="atualizaNota(this.value)" style="flex:1" />
            <div style="text-align:center">
              <div class="nota-num" id="nota-num" style="color:var(--amber2)">8</div>
              <div class="nota-cls" id="nota-cls" style="color:var(--amber2)">😐 Neutro</div>
            </div>
          </div>
          <div id="aviso-sac" style="display:none;background:var(--red-bg);border:1px solid rgba(239,68,68,.3);
            color:var(--red2);padding:8px 12px;border-radius:8px;font-size:12px;margin-top:8px">
            ⚠️ Nota abaixo de 8 — este cliente será enviado automaticamente para o SAC.
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Deseja Retorno?</label>
          <div class="toggle-row">
            <button type="button" class="tog" id="rt-sim" onclick="tog('rt','sim')">📞 Sim</button>
            <button type="button" class="tog" id="rt-nao" onclick="tog('rt','nao')">✅ Não</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-ctrl" id="obs" placeholder="Anotações adicionais…"></textarea>
        </div>
        <div class="row2">
          <div class="form-group">
            <label class="form-label">Operador</label>
            <input class="form-ctrl" id="operador" placeholder="Seu nome"
              value="${App.currentProfile?.nome||''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-ctrl" id="st-pesq">
              <option value="respondido">Respondido</option>
              <option value="concluido">Concluído</option>
              <option value="remarcar">Remarcar</option>
            </select>
          </div>
        </div>
      </div>
      <div id="bloco-nao" style="display:none">
        <div class="row2">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-ctrl" id="st-nao">
              <option value="nao_atendeu">Não Atendeu</option>
              <option value="remarcar">Remarcar</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Operador</label>
            <input class="form-ctrl" id="op-nao" placeholder="Seu nome"
              value="${App.currentProfile?.nome||''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-ctrl" id="obs-nao" placeholder="Motivo do não contato…"></textarea>
        </div>
      </div>
      <button type="submit" class="btn btn-success" style="width:100%;margin-top:6px;justify-content:center">
        💾 Salvar Pesquisa
      </button>
    </form>`;
}

function tog(g, v) {
  App.toggles[g] = v;
  const sim=qs(`#${g}-sim`), nao=qs(`#${g}-nao`);
  if (!sim||!nao) return;
  sim.className='tog'+(v==='sim'?' yes':'');
  nao.className='tog'+(v==='nao'?' no':'');
  if (g==='ct') { show('bloco-sim',v==='sim'); show('bloco-nao',v==='nao'); }
  if (g==='pr') show('grp-prob',v==='sim');
}

function atualizaNota(v) {
  const n=+v, numEl=qs('#nota-num'), clsEl=qs('#nota-cls'), aviso=qs('#aviso-sac');
  if (!numEl) return;
  const color=n>=9?'var(--green2)':n>=7?'var(--amber2)':'var(--red2)';
  const label=n>=9?'😊 Satisfeito':n>=7?'😐 Neutro':'😞 Insatisfeito';
  numEl.textContent=n; numEl.style.color=color;
  clsEl.textContent=label; clsEl.style.color=color;
  if (aviso) aviso.style.display = n<8?'block':'none';
}

async function salvarPesquisa(e) {
  e.preventDefault();
  if (!App.entregaSel) return;
  const contatoOk=App.toggles['ct']==='sim';
  const temProb=App.toggles['pr']==='sim';
  const retorno=App.toggles['rt']==='sim';
  if (!App.toggles['ct']) { toast('Informe se o contato foi realizado.','err'); return; }
  if (contatoOk && !App.toggles['pr']) { toast('Informe se houve problema.','err'); return; }
  if (contatoOk && temProb && !val('desc-prob').trim()) { toast('Descreva o problema relatado.','err'); return; }
  if (contatoOk && !App.toggles['rt']) { toast('Informe se deseja retorno.','err'); return; }

  let status, operador, obs;
  if (contatoOk) {
    status  =val('st-pesq')||'respondido'; operador=val('operador'); obs=val('obs');
  } else {
    status  =val('st-nao')||'nao_atendeu'; operador=val('op-nao'); obs=val('obs-nao');
  }

  const nota = contatoOk ? +val('nota-sl') : null;

  const row = {
    delivery_id:         App.entregaSel.id,
    codigo_cliente:      App.entregaSel.codigo_cliente,
    nome_cliente:        App.entregaSel.nome_cliente,
    telefone:            contatoOk ? val('tel-ct')||null : null,
    filial:              App.entregaSel.filial,
    tecnico_responsavel: App.entregaSel.tecnico_responsavel,
    contato_realizado:   contatoOk,
    nome_contato:        contatoOk ? val('nome-ct')||null : null,
    teve_problema:       contatoOk ? temProb : false,
    descricao_problema:  contatoOk&&temProb ? val('desc-prob') : null,
    nota_atendimento:    nota,
    deseja_retorno:      contatoOk ? retorno : false,
    observacoes:         obs||null,
    data_ligacao:        contatoOk ? (val('dt-lig')||hoje()) : hoje(),
    operador_responsavel:operador||null,
    status,
  };

  load(true);
  try {
    await insertSatisfaction(row);
    await updateDeliveryStatus(App.entregaSel.id, status);
    const msg = nota!=null && nota<8
      ? '✅ Pesquisa salva! ⚠️ Nota baixa — enviado ao SAC automaticamente.'
      : '✅ Pesquisa salva com sucesso!';
    toast(msg);
    App.entregaSel=null;
    await pagePesquisa(qs('#page'));
    await atualizarBadges();
  } catch(er) { toast('Erro: '+er.message,'err'); }
  finally { load(false); }
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
async function pageRelatorios(el) {
  const sats = await getSatisfactions();
  App.satisfactions = sats;
  const tecnicos=[...new Set(sats.map(s=>s.tecnico_responsavel).filter(Boolean))].sort();
  const filiais=[...new Set(sats.map(s=>s.filial).filter(Boolean))].sort();

  el.innerHTML=`
    <div class="flex-c gap12 mb20" style="justify-content:space-between;flex-wrap:wrap">
      <span class="muted small">${sats.length} pesquisas registradas</span>
      <button class="btn btn-ghost" onclick="exportarCSV()">⬇ Exportar CSV</button>
    </div>
    <div class="filters mb20">
      <div class="form-group"><label class="form-label">De</label><input class="form-ctrl" id="r-de" type="date" onchange="renderRel()" /></div>
      <div class="form-group"><label class="form-label">Até</label><input class="form-ctrl" id="r-ate" type="date" onchange="renderRel()" /></div>
      <div class="form-group"><label class="form-label">Técnico</label>
        <select class="form-ctrl" id="r-tec" onchange="renderRel()" style="min-width:150px">
          <option value="">Todos</option>${tecnicos.map(t=>`<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Filial</label>
        <select class="form-ctrl" id="r-fil" onchange="renderRel()" style="min-width:140px">
          <option value="">Todas</option>${filiais.map(f=>`<option>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-ctrl" id="r-st" onchange="renderRel()">
          <option value="">Todos</option>
          <option value="respondido">Respondido</option><option value="nao_atendeu">Não Atendeu</option>
          <option value="remarcar">Remarcar</option><option value="concluido">Concluído</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Filtro</label>
        <select class="form-ctrl" id="r-esp" onchange="renderRel()">
          <option value="">Nenhum</option>
          <option value="prob">Com Problema</option>
          <option value="ret">Pediu Retorno</option>
          <option value="sac">Enviados ao SAC</option>
          <option value="baixa">Nota Baixa (≤7)</option>
        </select>
      </div>
    </div>
    <div id="r-kpis" class="kpi-grid mb20"></div>
    <div class="card mb20" style="overflow:hidden">
      <div class="card-hd">
        <span class="card-title">Pesquisas</span>
        <span class="muted small" id="r-count">—</span>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Cliente</th><th>Filial</th><th>Técnico</th><th>Nota</th><th>SAC</th><th>Problema</th><th>Retorno</th><th>Operador</th><th>Data</th><th>Status</th></tr></thead>
        <tbody id="r-tbody"></tbody>
      </table></div>
    </div>
    <div class="g2">
      <div class="card"><div class="card-hd"><span class="card-title">📊 Média por Técnico</span></div><div id="r-tecs"></div></div>
      <div class="card"><div class="card-hd"><span class="card-title">🏢 Média por Filial</span></div><div id="r-fils"></div></div>
    </div>`;
  renderRel();
}

function renderRel() {
  let data=[...App.satisfactions];
  const de=val('r-de'),ate=val('r-ate'),tec=val('r-tec'),fil=val('r-fil'),st=val('r-st'),esp=val('r-esp');
  if (de)  data=data.filter(s=>s.data_ligacao>=de);
  if (ate) data=data.filter(s=>s.data_ligacao<=ate);
  if (tec) data=data.filter(s=>s.tecnico_responsavel===tec);
  if (fil) data=data.filter(s=>s.filial===fil);
  if (st)  data=data.filter(s=>s.status===st);
  if (esp==='prob')  data=data.filter(s=>s.teve_problema);
  if (esp==='ret')   data=data.filter(s=>s.deseja_retorno);
  if (esp==='sac')   data=data.filter(s=>s.enviado_para_sac);
  if (esp==='baixa') data=data.filter(s=>s.nota_atendimento!=null&&s.nota_atendimento<=7);
  App._relFiltrado=data;
  const notas=data.filter(s=>s.nota_atendimento!=null);
  const media=notas.length>0?(notas.reduce((a,b)=>a+b.nota_atendimento,0)/notas.length).toFixed(1):'—';
  qs('#r-kpis').innerHTML=`
    ${kpi('blue','📋','Total',data.length,'pesquisas')}
    ${kpi('purple','⭐','Média',media,'satisfação')}
    ${kpi('red','🚨','Com Problema',data.filter(s=>s.teve_problema).length,'clientes')}
    ${kpi('amber','📞','Retorno',data.filter(s=>s.deseja_retorno).length,'pendentes')}
    ${kpi('red','🆘','Enviados SAC',data.filter(s=>s.enviado_para_sac).length,'automático')}
  `;
  qs('#r-count').textContent=`${data.length} registros`;
  qs('#r-tbody').innerHTML=data.length===0
    ?`<tr><td colspan="10">${emptyState('🔍','Sem resultados')}</td></tr>`
    :data.map(s=>`<tr>
      <td class="td-main">${s.nome_cliente||s.codigo_cliente||'—'}</td>
      <td>${s.filial||'—'}</td><td>${s.tecnico_responsavel||'—'}</td>
      <td>${chipNota(s.nota_atendimento)}</td>
      <td>${s.enviado_para_sac?'<span class="sac-badge sb-urgente">🆘 SAC</span>':'<span class="muted">—</span>'}</td>
      <td>${s.teve_problema?'<span class="badge b-nao-atendeu">⚠️ Sim</span>':'<span class="muted">Não</span>'}</td>
      <td>${s.deseja_retorno?'<span class="retorno-tag">📞</span>':'<span class="muted">Não</span>'}</td>
      <td>${s.operador_responsavel||'—'}</td>
      <td class="td-mono">${fmtDate(s.data_ligacao)}</td>
      <td>${badgeStatus(s.status)}</td>
    </tr>`).join('');

  // Rankings
  const tecMap={};
  for(const s of notas){const t=s.tecnico_responsavel||'Sem técnico';if(!tecMap[t])tecMap[t]=[];tecMap[t].push(s.nota_atendimento);}
  const tecRank=Object.entries(tecMap).map(([n,ns])=>({nome:n,media:+(ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1),total:ns.length})).sort((a,b)=>b.media-a.media);
  qs('#r-tecs').innerHTML=tecRank.length===0?emptyState('👷','Sem dados'):tecRank.map((t,i)=>rankItem(t,i)).join('');
  const filMap={};
  for(const s of notas){const f=s.filial||'Sem filial';if(!filMap[f])filMap[f]=[];filMap[f].push(s.nota_atendimento);}
  const filRank=Object.entries(filMap).map(([n,ns])=>({nome:n,media:+(ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1),total:ns.length})).sort((a,b)=>b.media-a.media);
  qs('#r-fils').innerHTML=filRank.length===0?emptyState('🏢','Sem dados'):filRank.map((f,i)=>rankItem(f,i)).join('');
}

function exportarCSV() {
  const data=App._relFiltrado||App.satisfactions;
  const hdr='Código,Nome,Filial,Técnico,Nota,SAC,Problema,Retorno,Observações,Operador,Data,Status';
  const rows=data.map(s=>
    `${s.codigo_cliente||''},"${esc(s.nome_cliente)}","${esc(s.filial)}","${esc(s.tecnico_responsavel)}",${s.nota_atendimento??''},${s.enviado_para_sac?'Sim':'Não'},"${s.teve_problema?'Sim':'Não'}","${s.deseja_retorno?'Sim':'Não'}","${esc(s.observacoes)}","${esc(s.operador_responsavel)}",${s.data_ligacao||''},${s.status||''}`
  );
  const csv='\uFEFF'+[hdr,...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='relatorio.csv';a.click();
  URL.revokeObjectURL(url);
}

// ─── Nova Entrega ──────────────────────────────────────────────────────────────
function openNovaEntrega() {
  openModal(`
    <div class="modal-hd"><div class="modal-title">＋ Nova Entrega</div><button class="btn-x" onclick="closeModal()">✕</button></div>
    <div class="modal-bd">
      <form onsubmit="salvarNovaEntrega(event)">
        <div class="row2">
          <div class="form-group"><label class="form-label">Código</label><input class="form-ctrl" id="ne-cod" required /></div>
          <div class="form-group"><label class="form-label">Nome do Cliente</label><input class="form-ctrl" id="ne-nome" required /></div>
        </div>
        <div class="row2">
          <div class="form-group"><label class="form-label">Filial</label><input class="form-ctrl" id="ne-fil" required /></div>
          <div class="form-group"><label class="form-label">Técnico</label><input class="form-ctrl" id="ne-tec" /></div>
        </div>
        <div class="row2">
          <div class="form-group"><label class="form-label">Data Entrega</label><input class="form-ctrl" id="ne-dt" type="date" value="${hoje()}" required /></div>
          <div class="form-group"><label class="form-label">Tipo de Serviço</label><input class="form-ctrl" id="ne-tipo" /></div>
        </div>
        <div class="modal-ft" style="padding:0;margin-top:8px">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>`);
}

async function salvarNovaEntrega(e) {
  e.preventDefault();
  const row={codigo_cliente:val('ne-cod').trim(),nome_cliente:val('ne-nome').trim(),filial:val('ne-fil').trim(),tecnico_responsavel:val('ne-tec').trim()||null,data_entrega:val('ne-dt'),tipo_servico:val('ne-tipo').trim()||null,status_pesquisa:'pendente'};
  load(true);
  try { await insertDeliveries([row]); closeModal(); toast('Entrega cadastrada! ✅'); await pageEntregas(qs('#page')); }
  catch(er) { toast('Erro: '+er.message,'err'); }
  finally { load(false); }
}

// ─── Import ────────────────────────────────────────────────────────────────────
function openImport() {
  App.importRows=[];
  openModal(`
    <div class="modal-hd"><div class="modal-title">⬆ Importar Entregas</div><button class="btn-x" onclick="closeModal()">✕</button></div>
    <div class="modal-bd">
      <div class="import-box"><strong>Colunas esperadas:</strong><br>
      <span class="import-cols">Código do Cliente · Nome do Cliente · Filial · Técnico Responsável · Data da Entrega · Tipo de Serviço</span></div>
      <div class="form-group"><label class="form-label">Arquivo CSV ou XLSX</label>
        <input class="form-ctrl" type="file" accept=".csv,.xlsx,.xls" onchange="previewImport(this)" /></div>
      <div id="imp-prev"></div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-imp" style="display:none" onclick="confirmarImport()">✅ Importar</button>
    </div>`);
}

async function previewImport(input) {
  const file=input.files[0]; if(!file) return;
  const prev=qs('#imp-prev');
  prev.innerHTML='<div class="muted small mt12">Lendo…</div>';
  try {
    const rows=await lerArquivo(file);
    App.importRows=rows.map(r=>({
      codigo_cliente:str(r,'Código do Cliente','codigo_cliente','Código','codigo'),
      nome_cliente:str(r,'Nome do Cliente','nome_cliente','Nome','nome'),
      filial:str(r,'Filial','filial'),
      tecnico_responsavel:str(r,'Técnico Responsável','tecnico_responsavel','Técnico','tecnico')||null,
      data_entrega:parseDate(r['Data da Entrega']||r['data_entrega']||r['Data']||''),
      tipo_servico:str(r,'Tipo de Serviço','tipo_servico','Tipo','tipo')||null,
      status_pesquisa:'pendente',
    })).filter(r=>r.codigo_cliente&&r.nome_cliente);
    if(!App.importRows.length){prev.innerHTML='<div class="red small mt12">Nenhum registro válido.</div>';return;}
    prev.innerHTML=`<div class="green small mt12 mb16">✅ ${App.importRows.length} registros encontrados</div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:180px;overflow-y:auto">
        <table style="font-size:12px"><thead><tr style="background:var(--bg3)">
          <th style="padding:8px 10px">Código</th><th style="padding:8px 10px">Nome</th>
          <th style="padding:8px 10px">Filial</th><th style="padding:8px 10px">Técnico</th>
        </tr></thead><tbody>${App.importRows.slice(0,5).map(r=>`
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 10px;color:var(--text2)">${r.codigo_cliente}</td>
            <td style="padding:8px 10px;color:var(--text2)">${r.nome_cliente}</td>
            <td style="padding:8px 10px;color:var(--text3)">${r.filial||'—'}</td>
            <td style="padding:8px 10px;color:var(--text3)">${r.tecnico_responsavel||'—'}</td>
          </tr>`).join('')}
          ${App.importRows.length>5?`<tr><td colspan="4" style="padding:8px 10px;text-align:center;color:var(--text3)">… e mais ${App.importRows.length-5}</td></tr>`:''}
        </tbody></table></div>`;
    show('btn-imp',true);
  } catch(e) { prev.innerHTML=`<div class="red small mt12">Erro: ${e.message}</div>`; }
}

async function confirmarImport() {
  if(!App.importRows.length) return;
  load(true);
  try {
    for(let i=0;i<App.importRows.length;i+=100) await insertDeliveries(App.importRows.slice(i,i+100));
    closeModal(); toast(`${App.importRows.length} entregas importadas! ✅`); App.importRows=[];
    await pageEntregas(qs('#page'));
  } catch(e) { toast('Erro: '+e.message,'err'); }
  finally { load(false); }
}

function lerArquivo(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try {
        if(file.name.endsWith('.csv')){
          const lines=e.target.result.split('\n').filter(l=>l.trim());
          const hdrs=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
          const rows=lines.slice(1).map(line=>{
            const vals=[];let cur='',inQ=false;
            for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else{cur+=ch;}}
            vals.push(cur.trim());
            const o={};hdrs.forEach((h,i)=>o[h]=vals[i]||'');return o;
          });
          resolve(rows);
        } else {
          const wb=XLSX.read(e.target.result,{type:'binary',cellDates:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws,{defval:''}));
        }
      } catch(err){reject(err);}
    };
    reader.onerror=()=>reject(new Error('Falha ao ler o arquivo'));
    file.name.endsWith('.csv')?reader.readAsText(file,'UTF-8'):reader.readAsBinaryString(file);
  });
}

function parseDate(v){
  if(!v)return null;
  if(v instanceof Date)return v.toISOString().split('T')[0];
  if(typeof v==='number'){const d=new Date((v-25569)*86400000);return d.toISOString().split('T')[0];}
  const s=String(v).trim();
  if(s.includes('/'))return s.split('/').reverse().join('-');
  return s||null;
}

async function verDetalhes(deliveryId) {
  load(true);
  try {
    const s=await getSatisfactionByDelivery(deliveryId);
    if(!s){toast('Pesquisa não encontrada.','err');return;}
    openModal(`
      <div class="modal-hd"><div class="modal-title">👁 Detalhes da Pesquisa</div><button class="btn-x" onclick="closeModal()">✕</button></div>
      <div class="modal-bd">
        <div class="sac-info-grid">
          <div><div class="form-label">Cliente</div><div class="bold">${s.nome_cliente||s.codigo_cliente}</div></div>
          <div><div class="form-label">Filial</div><div>${s.filial||'—'}</div></div>
          <div><div class="form-label">Técnico</div><div>${s.tecnico_responsavel||'—'}</div></div>
          <div><div class="form-label">Nota</div>${chipNota(s.nota_atendimento)}</div>
          <div><div class="form-label">Status</div>${badgeStatus(s.status)}</div>
          <div><div class="form-label">Data</div><div>${fmtDate(s.data_ligacao)}</div></div>
        </div>
        ${s.enviado_para_sac?`<div style="background:var(--red-bg);border:1px solid rgba(239,68,68,.3);color:var(--red2);padding:10px 14px;border-radius:8px;margin:12px 0;font-size:13px">🆘 Este cliente foi enviado automaticamente para o SAC por nota baixa.</div>`:''}
        ${s.descricao_problema?`<div class="form-group"><div class="form-label">Problema</div><div class="muted">${s.descricao_problema}</div></div>`:''}
        ${s.observacoes?`<div class="form-group"><div class="form-label">Observações</div><div class="muted">${s.observacoes}</div></div>`:''}
        <div class="row2">
          <div><div class="form-label">Operador</div><div>${s.operador_responsavel||'—'}</div></div>
          <div><div class="form-label">Retorno?</div><div>${s.deseja_retorno?'📞 Sim':'Não'}</div></div>
        </div>
      </div>
      <div class="modal-ft"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>`);
  } finally { load(false); }
}

async function irParaPesquisa(id) {
  App.deliveries=await getDeliveries({status:'pendente'});
  await goto('pesquisa');
  setTimeout(()=>selEntrega(id),200);
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function fazerLogout() {
  load(true);
  try { await AuthService.logout(); }
  catch(e) { toast('Erro ao sair.','err'); load(false); }
}

function toggleUserMenu() {
  const m=qs('#user-menu');
  if(m) m.style.display=m.style.display==='none'?'block':'none';
}
function closeUserMenu() { const m=qs('#user-menu'); if(m) m.style.display='none'; }

// ─── Helpers HTML ──────────────────────────────────────────────────────────────
function kpi(color,icon,label,value,sub=''){
  return`<div class="kpi ${color}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div><div class="kpi-ico">${icon}</div></div>`;
}
function rankItem(t,i){
  const cls=i===0?'rp-1':i===1?'rp-2':i===2?'rp-3':'rp-n';
  const color=t.media>=9?'var(--green2)':t.media>=7?'var(--amber2)':'var(--red2)';
  const pct=(t.media/10*100).toFixed(0);
  return`<div class="rank-item"><div class="rank-pos ${cls}">${i+1}</div><div style="flex:1"><div class="rank-name">${t.nome}</div><div class="rank-sub">${t.total} pesquisa${t.total>1?'s':''}</div><div class="prog"><div class="prog-fill" style="width:${pct}%;background:${color}"></div></div></div><div class="rank-media" style="color:${color}">${t.media}</div></div>`;
}
function chipNota(n){
  if(n==null)return'<span class="nota-chip n-nil">—</span>';
  const cls=n>=9?'n-sat':n>=7?'n-neu':'n-ins';
  return`<span class="nota-chip ${cls}">${n}</span>`;
}
function badgeStatus(s){
  const m={pendente:['b-pendente','⏳ Pendente'],respondido:['b-respondido','✅ Respondido'],nao_atendeu:['b-nao-atendeu','📵 Não Atendeu'],remarcar:['b-remarcar','🔄 Remarcar'],concluido:['b-concluido','🏁 Concluído']};
  const[cls,lbl]=m[s]||['b-pendente',s||'—'];
  return`<span class="badge ${cls}">${lbl}</span>`;
}
function statusLabel(s){const m={pendente:'Pendente',respondido:'Respondido',nao_atendeu:'Não Atendeu',remarcar:'Remarcar',concluido:'Concluído'};return m[s]||s;}
function emptyState(icon,h3,p=''){return`<div class="empty"><div class="ei">${icon}</div><h3>${h3}</h3><p>${p}</p></div>`;}
function err(msg){return`<div class="card">${emptyState('⚠️','Erro ao carregar',msg)}</div>`;}

// ─── Modal ─────────────────────────────────────────────────────────────────────
function openModal(html, large=false){
  let ov=qs('#modal-ov');
  if(!ov){ov=document.createElement('div');ov.id='modal-ov';ov.className='overlay';ov.onclick=e=>{if(e.target===ov)closeModal();};document.body.appendChild(ov);}
  ov.innerHTML=`<div class="modal${large?' large':''}">${html}</div>`;
  ov.classList.add('open');
}
function closeModal(){qs('#modal-ov')?.classList.remove('open');}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg,type='ok'){
  const el=document.createElement('div');el.className=`toast toast-${type}`;el.textContent=msg;
  document.body.appendChild(el);setTimeout(()=>el.remove(),3500);
}

// ─── Loader ────────────────────────────────────────────────────────────────────
function load(on){qs('#loader')?.classList.toggle('on',on);}

// ─── Utils ─────────────────────────────────────────────────────────────────────
function qs(sel,ctx=document){return ctx.querySelector(sel);}
function val(id){return qs(`#${id}`)?.value||'';}
function show(id,v){const el=qs(`#${id}`);if(el)el.style.display=v?'block':'none';}
function hoje(){return new Date().toISOString().split('T')[0];}
function fmtDate(d){if(!d)return'—';const[y,m,day]=String(d).split('-');return day&&m&&y?`${day}/${m}/${y}`:d;}
function esc(v){return String(v||'').replace(/"/g,'""');}
function str(r,...keys){for(const k of keys){const v=r[k];if(v!=null&&v!=='')return String(v).trim();}return'';}

// ─── Página SAC ───────────────────────────────────────────────────────────────
async function pageSac(el) {
  const atendimentos = await SacService.getAtendimentos();
  App.sacAtendimentos = atendimentos;
  const stats = await SacService.getStats();
  const pendUrgentes = atendimentos.filter(a => {
    const vencido = a.data_proximo_retorno && new Date(a.data_proximo_retorno) < new Date();
    return (a.status === 'pendente' || vencido) && !['resolvido','encerrado_sem_sucesso'].includes(a.status);
  }).length;

  el.innerHTML = `
    <!-- KPIs SAC -->
    <div class="kpi-grid mb20">
      ${kpi('red',   '🚨', 'Pendentes',          stats.pendentes,          'aguardando atendimento')}
      ${kpi('amber', '🔄', 'Em Atendimento',      stats.em_atendimento,     'em andamento')}
      ${kpi('purple','📞', 'Aguard. Retorno',     stats.aguardando_retorno, 'agendados')}
      ${kpi('green', '✅', 'Resolvidos',          stats.resolvidos,         'casos concluídos')}
      ${kpi('blue',  '📊', 'Média das Notas',     stats.media_nota ?? '—',  'dos casos SAC')}
      ${pendUrgentes > 0 ? kpi('red','⚡','Urgentes / Vencidos', pendUrgentes,'retornos vencidos') : ''}
    </div>

    <!-- Filtros -->
    <div class="filters mb16">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-ctrl" id="sac-status" onchange="filtrarSac()" style="min-width:180px">
          <option value="todos">Todos</option>
          <option value="pendente">⏳ Pendente</option>
          <option value="em_atendimento">🔄 Em Atendimento</option>
          <option value="aguardando_retorno">📞 Aguardando Retorno</option>
          <option value="resolvido">✅ Resolvido</option>
          <option value="encerrado_sem_sucesso">❌ Encerrado s/ Sucesso</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nota máxima</label>
        <select class="form-ctrl" id="sac-nota" onchange="filtrarSac()">
          <option value="">Todas</option>
          <option value="3">Até 3</option>
          <option value="5">Até 5</option>
          <option value="7">Até 7</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Buscar</label>
        <input class="form-ctrl" id="sac-busca" placeholder="Nome ou telefone…" oninput="filtrarSac()" style="min-width:200px" />
      </div>
      <div class="form-group" style="align-self:flex-end">
        <label class="form-label">Urgentes primeiro</label>
        <input type="checkbox" id="sac-urgentes" onchange="filtrarSac()"
          style="width:20px;height:20px;cursor:pointer;accent-color:var(--red)" />
      </div>
    </div>

    <!-- Tabela -->
    <div class="card" style="overflow:hidden">
      <div class="card-hd">
        <span class="card-title">🆘 Atendimentos SAC</span>
        <span class="muted small" id="sac-count">${atendimentos.length} registros</span>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Cliente</th>
            <th>Telefone</th>
            <th>Nota</th>
            <th>Motivo</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Próx. Retorno</th>
            <th>Últ. Obs.</th>
            <th>Ações</th>
          </tr></thead>
          <tbody id="sac-tbody">
            ${renderSacRows(atendimentos)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderSacRows(lista) {
  if (!lista.length) return `<tr><td colspan="9">${emptyState('🆘','Nenhum caso no SAC','Casos com nota abaixo de 8 aparecem aqui automaticamente')}</td></tr>`;

  const hoje = new Date();
  return lista.map(a => {
    const vencido = a.data_proximo_retorno && new Date(a.data_proximo_retorno) < hoje
      && !['resolvido','encerrado_sem_sucesso'].includes(a.status);
    const rowStyle = vencido ? 'background:rgba(239,68,68,.04);' : '';
    const urgTag   = vencido ? '<span class="sac-badge sb-urgente" style="margin-left:6px">⚡ VENCIDO</span>' : '';

    return `<tr style="${rowStyle}cursor:pointer" onclick="abrirSacDetalhe('${a.id}')"
      onmouseenter="this.style.background='rgba(255,255,255,.03)'"
      onmouseleave="this.style.background='${vencido?'rgba(239,68,68,.04)':'transparent'}'">
      <td class="td-main">${a.nome_cliente||'—'}${urgTag}</td>
      <td>${a.telefone||'—'}</td>
      <td>${chipNota(a.nota)}</td>
      <td class="muted small" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.motivo||'—'}</td>
      <td>${SacService.statusBadge(a.status)}</td>
      <td>${a.responsavel_nome||'<span class="muted">Não atribuído</span>'}</td>
      <td>${a.data_proximo_retorno ? `<span style="color:${vencido?'var(--red2)':'var(--amber2)'}">${fmtDatetime(a.data_proximo_retorno)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="muted small" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.ultima_observacao||'—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="flex-c gap8">
          <button class="btn btn-ghost btn-sm" onclick="abrirSacDetalhe('${a.id}')">👁 Ver</button>
          <button class="btn btn-sm" style="background:var(--green-bg);color:var(--green2);border:1px solid rgba(16,185,129,.3)"
            onclick="quickResolve('${a.id}')">✅</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filtrarSac() {
  const status   = qs('#sac-status')?.value  || 'todos';
  const notaMax  = qs('#sac-nota')?.value;
  const busca    = (qs('#sac-busca')?.value || '').toLowerCase();
  const urgentes = qs('#sac-urgentes')?.checked;
  const hoje     = new Date();

  let lista = [...(App.sacAtendimentos || [])];
  if (status !== 'todos')    lista = lista.filter(a => a.status === status);
  if (notaMax)               lista = lista.filter(a => a.nota != null && a.nota <= +notaMax);
  if (busca)                 lista = lista.filter(a =>
    (a.nome_cliente||'').toLowerCase().includes(busca) || (a.telefone||'').includes(busca)
  );
  if (urgentes) lista = lista.filter(a =>
    a.data_proximo_retorno && new Date(a.data_proximo_retorno) < hoje &&
    !['resolvido','encerrado_sem_sucesso'].includes(a.status)
  );

  const tbody = qs('#sac-tbody');
  if (tbody) tbody.innerHTML = renderSacRows(lista);
  const cnt = qs('#sac-count');
  if (cnt) cnt.textContent = `${lista.length} registros`;
}

// ─── Modal de Detalhes do SAC ─────────────────────────────────────────────────
async function abrirSacDetalhe(id) {
  load(true);
  try {
    const { atendimento: a, historico } = await SacService.getAtendimento(id);

    openModal(`
      <div class="modal-hd">
        <div>
          <div class="modal-title">🆘 Atendimento SAC</div>
          <div class="muted small mt-2">${a.nome_cliente}</div>
        </div>
        <button class="btn-x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <!-- Info do cliente -->
        <div class="sac-info-grid">
          <div><div class="form-label">Cliente</div><div class="bold">${a.nome_cliente||'—'}</div></div>
          <div><div class="form-label">Telefone</div><div>${a.telefone||'—'}</div></div>
          <div><div class="form-label">Nota</div>${chipNota(a.nota)}</div>
          <div><div class="form-label">Status</div>${SacService.statusBadge(a.status)}</div>
          <div><div class="form-label">Responsável</div><div>${a.responsavel_nome||'Não atribuído'}</div></div>
          <div><div class="form-label">Encaminhado em</div><div>${fmtDatetime(a.data_encaminhamento)}</div></div>
        </div>

        ${a.motivo ? `
        <div style="background:var(--red-bg);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px 14px;margin:14px 0">
          <div class="form-label" style="color:var(--red2);margin-bottom:4px">Motivo / Reclamação</div>
          <div class="muted">${a.motivo}</div>
        </div>` : ''}

        <!-- Alterar Status -->
        <div class="sec-title mt16">Alterar Status</div>
        <div class="row2 mb16">
          <div class="form-group">
            <label class="form-label">Novo Status</label>
            <select class="form-ctrl" id="sac-novo-status">
              <option value="pendente">⏳ Pendente</option>
              <option value="em_atendimento">🔄 Em Atendimento</option>
              <option value="aguardando_retorno">📞 Aguardando Retorno</option>
              <option value="resolvido">✅ Resolvido</option>
              <option value="encerrado_sem_sucesso">❌ Encerrado s/ Sucesso</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Observação</label>
            <input class="form-ctrl" id="sac-obs-status" placeholder="Motivo da mudança…" />
          </div>
        </div>
        <button class="btn btn-ghost btn-sm mb16" onclick="salvarStatusSac('${a.id}')">💾 Atualizar Status</button>

        <!-- Registrar Interação -->
        <div class="sec-title">Registrar Nova Interação</div>
        <div class="row3 mb12">
          <div class="form-group">
            <label class="form-label">Canal</label>
            <select class="form-ctrl" id="hist-canal">
              <option value="telefone">📞 Telefone</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="email">📧 E-mail</option>
              <option value="presencial">🤝 Presencial</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Data do Contato</label>
            <input class="form-ctrl" id="hist-data" type="datetime-local" value="${datetimeLocalNow()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Próx. Retorno</label>
            <input class="form-ctrl" id="hist-prox" type="datetime-local" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição do Atendimento <span style="color:var(--red)">*</span></label>
          <textarea class="form-ctrl" id="hist-desc" placeholder="Descreva o que foi conversado…" style="min-height:80px"></textarea>
        </div>
        <div class="row2 mb16">
          <div class="form-group">
            <label class="form-label">Resultado</label>
            <input class="form-ctrl" id="hist-result" placeholder="Ex: Cliente aceitou retorno" />
          </div>
          <div class="form-group">
            <label class="form-label">Próxima Ação</label>
            <input class="form-ctrl" id="hist-prox-acao" placeholder="Ex: Ligar novamente" />
          </div>
        </div>
        <button class="btn btn-primary btn-sm mb20" onclick="salvarHistorico('${a.id}')">📝 Registrar Interação</button>

        <!-- Timeline -->
        <div class="sec-title">Histórico de Interações (${historico.length})</div>
        <div id="timeline-hist">
          ${renderTimeline(historico)}
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
        <button class="btn btn-success" onclick="quickResolve('${a.id}')">✅ Marcar Resolvido</button>
      </div>
    `, true); // true = modal largo

    // Pré-selecionar status atual
    const selSt = qs('#sac-novo-status');
    if (selSt) selSt.value = a.status;

  } finally { load(false); }
}

function renderTimeline(historico) {
  if (!historico.length) return `<div class="muted small center" style="padding:20px">Nenhuma interação registrada ainda.</div>`;

  const canais = { telefone:'📞', whatsapp:'💬', email:'📧', presencial:'🤝', outro:'💬' };
  return `<div class="timeline">` + historico.map((h, i) => `
    <div class="timeline-item ${i===0?'timeline-first':''}">
      <div class="timeline-dot">${canais[h.canal_contato]||'💬'}</div>
      <div class="timeline-content">
        <div class="flex-c gap8" style="justify-content:space-between;flex-wrap:wrap">
          <div class="bold small">${h.usuario_nome||'Sistema'}</div>
          <div class="muted small">${fmtDatetime(h.data_contato)}</div>
        </div>
        <div style="margin-top:6px;color:var(--text2)">${h.descricao}</div>
        ${h.resultado ? `<div class="muted small mt-2">Resultado: ${h.resultado}</div>` : ''}
        ${h.proxima_acao ? `<div class="muted small">Próx. ação: ${h.proxima_acao}</div>` : ''}
        ${h.data_proximo_retorno ? `<div style="color:var(--amber2);font-size:11px">📅 Retorno: ${fmtDatetime(h.data_proximo_retorno)}</div>` : ''}
      </div>
    </div>`).join('') + `</div>`;
}

async function salvarStatusSac(id) {
  const status = val('sac-novo-status');
  const obs    = val('sac-obs-status');
  load(true);
  try {
    await SacService.updateStatus(id, status, obs, App.currentProfile);
    toast('Status atualizado! ✅');
    closeModal();
    await goto('sac');
  } catch(e) { toast('Erro: '+e.message,'err'); }
  finally { load(false); }
}

async function salvarHistorico(atendimentoId) {
  const desc = val('hist-desc').trim();
  if (!desc) { toast('Descreva o atendimento.','err'); return; }

  load(true);
  try {
    await SacService.addHistorico(atendimentoId, {
      canal_contato:        val('hist-canal'),
      data_contato:         qs('#hist-data')?.value ? new Date(qs('#hist-data').value).toISOString() : new Date().toISOString(),
      descricao:            desc,
      resultado:            val('hist-result') || null,
      proxima_acao:         val('hist-prox-acao') || null,
      data_proximo_retorno: qs('#hist-prox')?.value ? new Date(qs('#hist-prox').value).toISOString() : null,
      usuario_id:           App.currentProfile?.id || null,
      usuario_nome:         App.currentProfile?.nome || 'Operador',
    });
    toast('Interação registrada! ✅');
    // Recarregar modal
    await abrirSacDetalhe(atendimentoId);
  } catch(e) { toast('Erro: '+e.message,'err'); }
  finally { load(false); }
}

async function quickResolve(id) {
  if (!confirm('Marcar este atendimento como RESOLVIDO?')) return;
  load(true);
  try {
    await SacService.updateStatus(id, 'resolvido', 'Marcado como resolvido.', App.currentProfile);
    toast('Resolvido! ✅');
    closeModal();
    await goto('sac');
  } catch(e) { toast('Erro: '+e.message,'err'); }
  finally { load(false); }
}

function datetimeLocalNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

function fmtDatetime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return d; }
}

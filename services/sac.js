// ─── Serviço do SAC ───────────────────────────────────────────────────────────
const SacService = {

  // Listar atendimentos com filtros
  async getAtendimentos(filters = {}) {
    let q = sb.from('sac_atendimentos').select('*').order('created_at', { ascending: false });
    if (filters.status && filters.status !== 'todos') q = q.eq('status', filters.status);
    if (filters.responsavel) q = q.eq('responsavel_id', filters.responsavel);
    if (filters.dateFrom)    q = q.gte('data_encaminhamento', filters.dateFrom);
    if (filters.dateTo)      q = q.lte('data_encaminhamento', filters.dateTo);
    if (filters.notaMax != null) q = q.lte('nota', filters.notaMax);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // Buscar atendimento por ID com histórico
  async getAtendimento(id) {
    const [{ data: atend, error: e1 }, { data: hist, error: e2 }] = await Promise.all([
      sb.from('sac_atendimentos').select('*').eq('id', id).single(),
      sb.from('sac_historico').select('*').eq('atendimento_id', id).order('data_contato', { ascending: false }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { atendimento: atend, historico: hist || [] };
  },

  // Atualizar status do atendimento
  async updateStatus(id, status, observacao, currentUser) {
    const update = {
      status,
      ultima_observacao: observacao || null,
      data_ultimo_contato: new Date().toISOString(),
    };
    if (status === 'resolvido') update.resolvido_em = new Date().toISOString();

    const { error } = await sb.from('sac_atendimentos').update(update).eq('id', id);
    if (error) throw error;

    // Registrar no histórico
    if (observacao) {
      await SacService.addHistorico(id, {
        descricao: `Status alterado para: ${SacService.statusLabel(status)}. ${observacao}`,
        resultado: status,
        usuario_nome: currentUser?.nome || 'Sistema',
        usuario_id: currentUser?.id || null,
        canal_contato: 'outro',
      });
    }
  },

  // Registrar interação no histórico
  async addHistorico(atendimentoId, dados) {
    const row = {
      atendimento_id:       atendimentoId,
      usuario_id:           dados.usuario_id || null,
      usuario_nome:         dados.usuario_nome || 'Sistema',
      data_contato:         dados.data_contato || new Date().toISOString(),
      canal_contato:        dados.canal_contato || 'outro',
      descricao:            dados.descricao,
      resultado:            dados.resultado || null,
      proxima_acao:         dados.proxima_acao || null,
      data_proximo_retorno: dados.data_proximo_retorno || null,
    };

    const { error } = await sb.from('sac_historico').insert([row]);
    if (error) throw error;

    // Atualizar data_ultimo_contato e proximo_retorno no atendimento
    const upd = { data_ultimo_contato: row.data_contato };
    if (dados.data_proximo_retorno) upd.data_proximo_retorno = dados.data_proximo_retorno;
    await sb.from('sac_atendimentos').update(upd).eq('id', atendimentoId);
  },

  // Atribuir responsável
  async atribuirResponsavel(id, responsavelId, responsavelNome) {
    const { error } = await sb.from('sac_atendimentos').update({
      responsavel_id: responsavelId,
      responsavel_nome: responsavelNome,
      status: 'em_atendimento',
    }).eq('id', id);
    if (error) throw error;
  },

  // Stats para dashboard
  async getStats() {
    const { data, error } = await sb.from('sac_atendimentos').select('status, nota, data_proximo_retorno');
    if (error) throw error;
    const atends = data || [];
    const hoje = new Date().toISOString();
    return {
      total:              atends.length,
      pendentes:          atends.filter(a => a.status === 'pendente').length,
      em_atendimento:     atends.filter(a => a.status === 'em_atendimento').length,
      aguardando_retorno: atends.filter(a => a.status === 'aguardando_retorno').length,
      resolvidos:         atends.filter(a => a.status === 'resolvido').length,
      encerrados:         atends.filter(a => a.status === 'encerrado_sem_sucesso').length,
      vencidos:           atends.filter(a => a.data_proximo_retorno && a.data_proximo_retorno < hoje && !['resolvido','encerrado_sem_sucesso'].includes(a.status)).length,
      media_nota:         atends.filter(a=>a.nota!=null).length > 0
        ? (atends.filter(a=>a.nota!=null).reduce((s,a)=>s+a.nota,0) / atends.filter(a=>a.nota!=null).length).toFixed(1)
        : null,
    };
  },

  // Labels de status
  statusLabel(s) {
    const m = {
      pendente:              '⏳ Pendente',
      em_atendimento:        '🔄 Em Atendimento',
      aguardando_retorno:    '📞 Aguardando Retorno',
      resolvido:             '✅ Resolvido',
      encerrado_sem_sucesso: '❌ Encerrado s/ Sucesso',
    };
    return m[s] || s;
  },

  // Badge HTML de status
  statusBadge(s) {
    const m = {
      pendente:              'sb-pendente',
      em_atendimento:        'sb-em-atend',
      aguardando_retorno:    'sb-aguard',
      resolvido:             'sb-resolvido',
      encerrado_sem_sucesso: 'sb-encerrado',
    };
    return `<span class="sac-badge ${m[s]||'sb-pendente'}">${SacService.statusLabel(s)}</span>`;
  },
};

// ─── Cliente Supabase ─────────────────────────────────────────────────────────
let sb;
function initSupabase() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ─── Entregas ─────────────────────────────────────────────────────────────────
async function getDeliveries(filters = {}) {
  let q = sb.from('service_deliveries').select('*').order('created_at', { ascending: false });
  if (filters.status)   q = q.eq('status_pesquisa', filters.status);
  if (filters.filial)   q = q.eq('filial', filters.filial);
  if (filters.tecnico)  q = q.eq('tecnico_responsavel', filters.tecnico);
  if (filters.dateFrom) q = q.gte('data_entrega', filters.dateFrom);
  if (filters.dateTo)   q = q.lte('data_entrega', filters.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function insertDeliveries(rows) {
  const { data, error } = await sb.from('service_deliveries').insert(rows).select();
  if (error) throw error;
  return data;
}

async function updateDeliveryStatus(id, status) {
  const { error } = await sb.from('service_deliveries').update({ status_pesquisa: status }).eq('id', id);
  if (error) throw error;
}

// ─── Pesquisas de Satisfação ──────────────────────────────────────────────────
async function getSatisfactions(filters = {}) {
  let q = sb.from('customer_satisfaction').select('*').order('created_at', { ascending: false });
  if (filters.filial)        q = q.eq('filial', filters.filial);
  if (filters.tecnico)       q = q.eq('tecnico_responsavel', filters.tecnico);
  if (filters.status)        q = q.eq('status', filters.status);
  if (filters.dateFrom)      q = q.gte('data_ligacao', filters.dateFrom);
  if (filters.dateTo)        q = q.lte('data_ligacao', filters.dateTo);
  if (filters.teveProblem)   q = q.eq('teve_problema', true);
  if (filters.desejaRetorno) q = q.eq('deseja_retorno', true);
  if (filters.notaMax != null) q = q.lte('nota_atendimento', filters.notaMax);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function insertSatisfaction(row) {
  const { data, error } = await sb.from('customer_satisfaction').insert([row]).select();
  if (error) throw error;
  return data[0];
}

async function getSatisfactionByDelivery(deliveryId) {
  const { data, error } = await sb.from('customer_satisfaction').select('*').eq('delivery_id', deliveryId).maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
async function getDashboardStats() {
  const [deliveries, satisfactions] = await Promise.all([getDeliveries(), getSatisfactions()]);

  const pendentes   = deliveries.filter(d => d.status_pesquisa === 'pendente').length;
  const respondidas = satisfactions.filter(s => ['respondido','concluido'].includes(s.status)).length;
  const comProblema = satisfactions.filter(s => s.teve_problema).length;
  const retorno     = satisfactions.filter(s => s.deseja_retorno).length;

  const comNota = satisfactions.filter(s => s.nota_atendimento != null);
  const mediaGeral = comNota.length > 0
    ? (comNota.reduce((a, b) => a + b.nota_atendimento, 0) / comNota.length).toFixed(1)
    : null;

  // Ranking por técnico
  const tecMap = {};
  for (const s of comNota) {
    const t = s.tecnico_responsavel || 'Sem técnico';
    if (!tecMap[t]) tecMap[t] = [];
    tecMap[t].push(s.nota_atendimento);
  }
  const rankingTecnicos = Object.entries(tecMap)
    .map(([nome, ns]) => ({ nome, media: +(ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1), total: ns.length }))
    .sort((a, b) => b.media - a.media);

  // Ranking por filial
  const filMap = {};
  for (const s of comNota) {
    const f = s.filial || 'Sem filial';
    if (!filMap[f]) filMap[f] = [];
    filMap[f].push(s.nota_atendimento);
  }
  const rankingFiliais = Object.entries(filMap)
    .map(([nome, ns]) => ({ nome, media: +(ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1), total: ns.length }))
    .sort((a, b) => b.media - a.media);

  return { totalEntregas: deliveries.length, pendentes, respondidas, comProblema, retorno, mediaGeral, rankingTecnicos, rankingFiliais, deliveries, satisfactions };
}

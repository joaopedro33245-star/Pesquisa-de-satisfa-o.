-- ============================================================
-- SATISFAZTECH — Setup completo do banco de dados (Supabase)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text,
  perfil     text not null default 'operador'
             check (perfil in ('admin','operador','sac')),
  ativo      boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. service_deliveries
create table if not exists public.service_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  codigo_cliente      text not null,
  nome_cliente        text not null,
  filial              text,
  tecnico_responsavel text,
  data_entrega        date,
  tipo_servico        text,
  status_pesquisa     text not null default 'pendente'
                      check (status_pesquisa in ('pendente','respondido','nao_atendeu','remarcar','concluido')),
  created_at          timestamptz default now()
);

-- 3. customer_satisfaction (adiciona colunas SAC se já existir)
create table if not exists public.customer_satisfaction (
  id                   uuid primary key default gen_random_uuid(),
  delivery_id          uuid references public.service_deliveries(id) on delete set null,
  codigo_cliente       text,
  nome_cliente         text,
  telefone             text,
  filial               text,
  tecnico_responsavel  text,
  contato_realizado    boolean default false,
  nome_contato         text,
  teve_problema        boolean default false,
  descricao_problema   text,
  nota_atendimento     int check (nota_atendimento >= 0 and nota_atendimento <= 10),
  deseja_retorno       boolean default false,
  observacoes          text,
  data_ligacao         date,
  operador_responsavel text,
  status               text default 'respondido',
  status_fluxo         text default 'normal' check (status_fluxo in ('normal','critico')),
  enviado_para_sac     boolean default false,
  created_at           timestamptz default now()
);

-- Adicionar colunas SAC se a tabela já existir
alter table public.customer_satisfaction add column if not exists telefone text;
alter table public.customer_satisfaction add column if not exists status_fluxo text default 'normal';
alter table public.customer_satisfaction add column if not exists enviado_para_sac boolean default false;

-- 4. sac_atendimentos
create table if not exists public.sac_atendimentos (
  id                   uuid primary key default gen_random_uuid(),
  pesquisa_id          uuid references public.customer_satisfaction(id) on delete cascade,
  codigo_cliente       text,
  nome_cliente         text not null,
  telefone             text,
  nota                 int,
  motivo               text,
  status               text not null default 'pendente'
                       check (status in ('pendente','em_atendimento','aguardando_retorno','resolvido','encerrado_sem_sucesso')),
  responsavel_id       uuid references public.profiles(id) on delete set null,
  responsavel_nome     text,
  data_encaminhamento  timestamptz default now(),
  data_ultimo_contato  timestamptz,
  data_proximo_retorno timestamptz,
  resolvido_em         timestamptz,
  ultima_observacao    text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- 5. sac_historico
create table if not exists public.sac_historico (
  id                   uuid primary key default gen_random_uuid(),
  atendimento_id       uuid references public.sac_atendimentos(id) on delete cascade,
  usuario_id           uuid references public.profiles(id) on delete set null,
  usuario_nome         text,
  data_contato         timestamptz default now(),
  canal_contato        text,
  descricao            text not null,
  resultado            text,
  proxima_acao         text,
  data_proximo_retorno timestamptz,
  created_at           timestamptz default now()
);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- Criar profile ao registrar usuário
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nome, email, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'perfil', 'operador')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enviar para SAC quando nota < 8
create or replace function public.handle_nota_baixa()
returns trigger language plpgsql security definer as $$
begin
  if new.nota_atendimento is not null and new.nota_atendimento < 8 then
    new.status_fluxo     := 'critico';
    new.enviado_para_sac := true;
    insert into public.sac_atendimentos (
      pesquisa_id, codigo_cliente, nome_cliente, telefone, nota, motivo, status
    ) values (
      new.id, new.codigo_cliente,
      coalesce(new.nome_cliente, new.nome_contato, 'Cliente'),
      new.telefone, new.nota_atendimento,
      coalesce(new.descricao_problema, new.observacoes, 'Nota baixa registrada'),
      'pendente'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_pesquisa_nota_baixa on public.customer_satisfaction;
create trigger on_pesquisa_nota_baixa
  before insert on public.customer_satisfaction
  for each row execute function public.handle_nota_baixa();

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_sac_upd on public.sac_atendimentos;
create trigger trg_sac_upd before update on public.sac_atendimentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_upd on public.profiles;
create trigger trg_profiles_upd before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_sat_nota   on public.customer_satisfaction(nota_atendimento);
create index if not exists idx_sat_sac    on public.customer_satisfaction(enviado_para_sac);
create index if not exists idx_sac_status on public.sac_atendimentos(status);
create index if not exists idx_hist_atend on public.sac_historico(atendimento_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles              enable row level security;
alter table public.service_deliveries    enable row level security;
alter table public.customer_satisfaction enable row level security;
alter table public.sac_atendimentos      enable row level security;
alter table public.sac_historico         enable row level security;

create or replace function public.get_my_perfil()
returns text language sql security definer stable as $$
  select perfil from public.profiles where id = auth.uid();
$$;

-- profiles
drop policy if exists "profiles_sel" on public.profiles;
create policy "profiles_sel" on public.profiles for select using (auth.uid() = id or get_my_perfil() = 'admin');
drop policy if exists "profiles_upd" on public.profiles;
create policy "profiles_upd" on public.profiles for update using (auth.uid() = id or get_my_perfil() = 'admin');

-- service_deliveries
drop policy if exists "del_all" on public.service_deliveries;
create policy "del_all" on public.service_deliveries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- customer_satisfaction
drop policy if exists "sat_all" on public.customer_satisfaction;
create policy "sat_all" on public.customer_satisfaction for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- sac_atendimentos
drop policy if exists "sac_all" on public.sac_atendimentos;
create policy "sac_all" on public.sac_atendimentos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- sac_historico
drop policy if exists "hist_all" on public.sac_historico;
create policy "hist_all" on public.sac_historico for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- DADOS MOCK
-- ============================================================
-- Crie os usuários via Supabase Auth > Users:
-- admin@satisfaztech.com    senha: Admin@123   (depois insira perfil 'admin')
-- operador@satisfaztech.com senha: Oper@123    (perfil 'operador')
-- sac@satisfaztech.com      senha: Sac@123     (perfil 'sac')

-- Após criar o usuário admin via Auth, execute:
-- update public.profiles set perfil = 'admin' where email = 'admin@satisfaztech.com';

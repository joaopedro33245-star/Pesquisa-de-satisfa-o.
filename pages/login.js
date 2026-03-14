// ─── Página de Login ──────────────────────────────────────────────────────────
async function renderLogin() {
  document.body.innerHTML = `
    <div class="login-bg">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-icon">📋</div>
          <h1>SatisfazTech</h1>
          <p>Pesquisa Pós-Entrega</p>
        </div>

        <form id="form-login" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input class="form-ctrl" id="login-email" type="email"
              placeholder="seu@email.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <div style="position:relative">
              <input class="form-ctrl" id="login-senha" type="password"
                placeholder="••••••••" required autocomplete="current-password" />
              <button type="button" onclick="toggleSenha()" 
                style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px"
                id="btn-olho">👁</button>
            </div>
          </div>

          <div id="login-erro" style="display:none;background:var(--red-bg);border:1px solid rgba(239,68,68,.3);
            color:var(--red2);padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px"></div>

          <button type="submit" class="btn btn-primary" id="btn-login"
            style="width:100%;justify-content:center;padding:12px;font-size:14px">
            Entrar
          </button>
        </form>

        <div style="text-align:center;margin-top:20px;font-size:11px;color:var(--text3)">
          SatisfazTech © 2025 · Todos os direitos reservados
        </div>
      </div>
    </div>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const btn   = document.getElementById('btn-login');
  const erro  = document.getElementById('login-erro');

  if (!email || !senha) {
    showLoginErro('Preencha e-mail e senha.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando…';
  erro.style.display = 'none';

  try {
    await AuthService.login(email, senha);
    // onAuthStateChange cuida do redirecionamento
  } catch(err) {
    showLoginErro(
      err.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' :
      err.message.includes('Email not confirmed') ? 'Confirme seu e-mail antes de entrar.' :
      'Erro ao entrar. Tente novamente.'
    );
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function showLoginErro(msg) {
  const el = document.getElementById('login-erro');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function toggleSenha() {
  const inp = document.getElementById('login-senha');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

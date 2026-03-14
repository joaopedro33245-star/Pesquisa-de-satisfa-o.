// ─── Serviço de Autenticação ──────────────────────────────────────────────────
const AuthService = {
  // Login
  async login(email, senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    return data;
  },

  // Logout
  async logout() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  },

  // Usuário atual
  async getUser() {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  },

  // Sessão atual
  async getSession() {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  },

  // Profile do usuário
  async getProfile(userId) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },

  // Ouvir mudanças de sessão
  onAuthChange(callback) {
    return sb.auth.onAuthStateChange(callback);
  }
};

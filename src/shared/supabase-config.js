// Configuración centralizada de Supabase
const SUPABASE_URL = 'https://lpsupabase.luispintasolutions.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.LJEZ3yyGRxLBmCKM9z3EW-Yla1SszwbmvQMngMe3IWA';

// Inicializar cliente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sincronización automática de Realtime con la sesión
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
        supabaseClient.realtime.setAuth(session.access_token);
        console.log("Realtime Auth sincronizado ✅");
    }
});

const AuthService = {
    async login(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;

        // Verificar que el usuario existe en la tabla daviplata_usuarios (Lectura)
        const { data: profile, error: profileError } = await supabaseClient
            .from('daviplata_usuarios')
            .select('*')
            .eq('auth_id', data.user.id)
            .single();
        
        if (profileError || !profile) {
            await supabaseClient.auth.signOut();
            throw new Error("El usuario no tiene un perfil asociado en DaviPlata.");
        }

        return data;
    },

    async logout(isExpired = false) {
        await supabaseClient.auth.signOut();
        const suffix = isExpired ? '?expired=1' : '';
        // Detectar si estamos en móvil o desktop para redirigir correctamente al login
        const path = window.location.pathname;
        if (path.includes('/mobile/')) {
            window.location.href = '/src/mobile/auth/login.html' + suffix;
        } else {
            window.location.href = '/src/desktop/auth/login.html' + suffix;
        }
    },

    async getSession() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.access_token) {
            supabaseClient.realtime.setAuth(session.access_token);
        }
        return session;
    },

    async getUserProfile(authId) {
        const { data, error } = await supabaseClient
            .from('daviplata_usuarios')
            .select('*')
            .eq('auth_id', authId)
            .maybeSingle();
        if (error) throw error;
        return data;
    }
};

window.supabaseClient = supabaseClient;
window.AuthService = AuthService;

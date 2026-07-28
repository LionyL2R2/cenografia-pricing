/* cenografia-pricing · configuração do Supabase
 *
 * COPIE este arquivo para `config.js` e preencha os dois valores.
 * `config.js` está no .gitignore e não vai para o repositório.
 *
 * Onde achar os valores: painel do Supabase → Project Settings → API
 *   SUPABASE_URL       = "Project URL"        (https://xxxx.supabase.co)
 *   SUPABASE_ANON_KEY  = "anon public" key    (nos projetos novos aparece
 *                        como "publishable key" — é a mesma coisa)
 *
 * A ANON KEY É PÚBLICA POR DESIGN. Ela é embutida no JavaScript que qualquer
 * visitante baixa; não existe jeito de escondê-la num app que roda no
 * navegador, e o Supabase a projetou assim. Ela identifica o PROJETO, não o
 * usuário — quem manda é o JWT que o login do Google devolve.
 *
 * A segurança está no RLS, não no sigilo da chave: sem estar logado, a anon
 * key sozinha não lê nem grava uma linha sequer (supabase/testes-rls.sql
 * verifica exatamente isso). O que NUNCA pode aparecer aqui é a `service_role`
 * key, essa sim ignora RLS e só existe para uso em servidor.
 *
 * ATENÇÃO NO DEPLOY: como `config.js` é ignorado pelo git, ele NÃO sobe para o
 * Vercel — o site publicado ficaria sem configuração. Veja "Deploy no Vercel"
 * em supabase/README.md antes de publicar.
 */
window.SUPABASE_URL = '';
window.SUPABASE_ANON_KEY = '';

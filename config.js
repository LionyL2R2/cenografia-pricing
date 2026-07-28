/* cenografia-pricing · configuração do Supabase
 *
 * Este arquivo É COMMITADO de propósito, e os dois valores abaixo são públicos.
 *
 * A anon key é pública por design. Ela vai embutida no JavaScript que qualquer
 * visitante baixa — não existe forma de escondê-la num app que roda no
 * navegador, e o Supabase a projetou assim. Ela identifica o PROJETO, não o
 * usuário: quem diz quem é você é o JWT que o login do Google devolve.
 *
 * A segurança está no RLS, não no sigilo desta chave. Sem sessão, a anon key
 * sozinha não lê nem grava uma linha (supabase/testes-rls.sql verifica isso).
 *
 * A service_role key NUNCA entra aqui, nem no repositório, nem em nenhum
 * arquivo que o navegador baixe: ela ignora RLS por definição e entregaria o
 * banco inteiro. Ela só existe para uso em servidor.
 *
 * Trocar de projeto Supabase = trocar estes dois valores. Mais nada.
 */
const SUPABASE_URL = 'https://dztbtrklcjuiokofmygj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6dGJ0cmtsY2p1aW9rb2ZteWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTU5MjksImV4cCI6MjEwMDgzMTkyOX0.KLelzTXyzWFlgJdAt8IfekpXZLd7qs4nacmx9pKYTxw';

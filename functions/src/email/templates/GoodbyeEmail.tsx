import { Text, Link } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface GoodbyeEmailProps {
  name: string;
}

const SLATE = 'linear-gradient(140deg, #3B4658 0%, #5A6B82 100%)';

export function GoodbyeEmail({ name }: GoodbyeEmailProps) {
  return (
    <EmailLayout
      preview="Seus dados foram removidos dos nossos servidores. Até logo."
      title={`Sua conta na Granativa foi excluída, ${name}`}
      accent={SLATE}
    >
      <Text style={emailParagraph}>
        Conforme sua solicitação, todos os seus dados financeiros, contas, transações e
        configurações foram removidos dos nossos servidores.
      </Text>

      <Text style={emailParagraph}>
        Se você tinha um espaço compartilhado ativo, seu parceiro foi notificado e o espaço
        foi ajustado. Seus dados pessoais nunca ficaram visíveis para ele.
      </Text>

      <Text style={emailParagraph}>
        Se foi engano ou você quiser voltar um dia, é só criar uma conta nova em{' '}
        <Link href="https://granativa.com.br" style={emailLink}>granativa.com.br</Link>.
      </Text>

      <Text style={emailParagraph}>
        Foi um prazer. Se tiver qualquer dúvida, fale com a gente em{' '}
        <Link href="mailto:privacidade@granativa.com.br" style={emailLink}>privacidade@granativa.com.br</Link>.
      </Text>
    </EmailLayout>
  );
}

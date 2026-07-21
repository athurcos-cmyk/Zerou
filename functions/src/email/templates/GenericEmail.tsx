import { Text, Link } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface GenericEmailProps {
  name: string;
  subject: string;
  purpose: string;
}

const SLATE = 'linear-gradient(140deg, #3B4658 0%, #5A6B82 100%)';

export function GenericEmail({ name, subject, purpose }: GenericEmailProps) {
  return (
    <EmailLayout preview={subject} title={subject} accent={SLATE}>
      <Text style={emailParagraph}>Olá, {name}.</Text>
      <Text style={emailParagraph}>{purpose}</Text>
      <Text style={emailParagraph}>
        Se tiver qualquer dúvida, fale com a gente em{' '}
        <Link href="mailto:suporte@granativa.com.br" style={emailLink}>suporte@granativa.com.br</Link>.
      </Text>
    </EmailLayout>
  );
}

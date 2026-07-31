import { Text } from '@react-email/components';
import { EmailLayout, emailParagraph } from './EmailLayout.js';

interface AdminMessageEmailProps {
  name: string;
  subject: string;
  body: string;
}

const SLATE = 'linear-gradient(140deg, #3B4658 0%, #5A6B82 100%)';

// Único template com texto livre — os outros têm um `purpose` fixo por kind
// (`GenericEmail.tsx`); este renderiza o que o admin escreveu, quebrado em
// parágrafos por linha em branco.
export function AdminMessageEmail({ name, subject, body }: AdminMessageEmailProps) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <EmailLayout preview={subject} title={subject} accent={SLATE}>
      <Text style={emailParagraph}>Olá, {name}.</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={emailParagraph}>{p}</Text>
      ))}
    </EmailLayout>
  );
}

import { Text, Link, Section, Button } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface ReengagementEmailProps {
  name: string;
}

const VIOLET = 'linear-gradient(140deg, #7C4DEE 0%, #9B72F2 100%)';

export function ReengagementEmail({ name }: ReengagementEmailProps) {
  return (
    <EmailLayout
      preview="Faz duas semanas que a gente não vê nenhum lançamento seu — sem cobrança, só um oi."
      title={`Sentimos sua falta, ${name}`}
      accent={VIOLET}
    >
      <Text style={emailParagraph}>
        Faz duas semanas que a gente não vê nenhum lançamento seu na Granativa. Sem cobrança —
        só um oi, porque sentimos sua falta.
      </Text>

      <Text style={emailParagraph}>
        Se a correria comeu seu tempo, lembra que dá pra lançar rapidinho: manda uma mensagem
        pro WhatsApp da Granativa, tipo "gastei 40 no mercado", e a Vic registra pra você. Sem
        abrir o app.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href="https://granativa.com.br/app" style={button}>
          Abrir Granativa
        </Button>
      </Section>

      <Text style={emailParagraph}>
        Se parou por outro motivo, me conta — é só responder este email ou escrever pra{' '}
        <Link href="mailto:suporte@granativa.com.br" style={emailLink}>suporte@granativa.com.br</Link>.
      </Text>
    </EmailLayout>
  );
}

const button: React.CSSProperties = {
  backgroundColor: '#EE5524',
  color: '#FFFFFF',
  padding: '13px 30px',
  borderRadius: '10px',
  fontWeight: 800,
  fontSize: '15px',
  textDecoration: 'none',
  display: 'inline-block',
  fontFamily: "'Instrument Sans', system-ui, sans-serif",
};

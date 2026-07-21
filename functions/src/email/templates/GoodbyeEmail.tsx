import {
  Html, Body, Container, Heading, Text, Link, Section
} from '@react-email/components';

interface GoodbyeEmailProps {
  name: string;
}

export function GoodbyeEmail({ name }: GoodbyeEmailProps) {
  return (
    <Html lang="pt-BR">
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>Sua conta na Granativa foi excluída, {name}</Heading>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Conforme sua solicitação, todos os seus dados financeiros, contas,
              transações e configurações foram removidos dos nossos servidores.
            </Text>

            <Text style={paragraph}>
              Se você tiver um espaço compartilhado ativo, seu parceiro foi notificado
              e o espaço foi ajustado. Seus dados pessoais não ficaram visíveis para ele.
            </Text>

            <Text style={paragraph}>
              Se foi engano ou você quiser voltar um dia, é só criar uma conta nova em{' '}
              <Link href="https://granativa.com.br">granativa.com.br</Link>.
            </Text>

            <Text style={paragraph}>
              Foi um prazer. Se tiver qualquer dúvida, fale com a gente em{' '}
              <Link href="mailto:privacidade@granativa.com.br">privacidade@granativa.com.br</Link>.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Granativa — Controle individual. Organização a dois.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#FAF8F5',
  fontFamily: "'Instrument Sans', system-ui, sans-serif",
  padding: '20px 0',
};

const container: React.CSSProperties = {
  maxWidth: '480px',
  margin: '0 auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 3px 10px rgba(28, 24, 20, 0.07)',
};

const header: React.CSSProperties = {
  background: 'linear-gradient(140deg, #3B4658 0%, #5A6B82 100%)',
  padding: '32px 28px',
};

const title: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: '20px',
  fontWeight: 800,
  margin: 0,
  lineHeight: 1.2,
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const content: React.CSSProperties = {
  padding: '28px',
};

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  color: '#1C1814',
  margin: '0 0 16px',
};

const footer: React.CSSProperties = {
  padding: '16px 28px',
  borderTop: '1px solid #EEE8E0',
  textAlign: 'center',
};

const footerText: React.CSSProperties = {
  fontSize: '12px',
  color: '#A0908A',
  margin: 0,
};

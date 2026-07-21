import {
  Html, Body, Container, Heading, Text, Link, Section, Row, Column, Img
} from '@react-email/components';

interface WelcomeEmailProps {
  name: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <Html lang="pt-BR">
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>Bem-vindo à Granativa, {name}!</Heading>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Sua conta foi criada e seu espaço pessoal está pronto. A Granativa te ajuda
              a saber pra onde vai seu dinheiro — direto no celular, mesmo offline.
            </Text>

            <Text style={paragraph}>
              Aqui vai o que você pode fazer agora:
            </Text>

            <Section style={steps}>
              <Row>
                <Column style={stepDot}><Text style={dotText}>1</Text></Column>
                <Column><Text style={stepText}>Lance sua primeira transação — é rápido, comece pelo valor.</Text></Column>
              </Row>
              <Row>
                <Column style={stepDot}><Text style={dotText}>2</Text></Column>
                <Column><Text style={stepText}>Cadastre seu cartão de crédito pra ver o que já está comprometido.</Text></Column>
              </Row>
              <Row>
                <Column style={stepDot}><Text style={dotText}>3</Text></Column>
                <Column><Text style={stepText}>Adicione suas contas recorrentes (assinaturas, aluguel) pra não ser pego de surpresa.</Text></Column>
              </Row>
            </Section>

            <Text style={paragraph}>
              E se preferir, lance transações direto pelo WhatsApp. É só mandar uma mensagem
              como "gastei 47 no mercado" pro número da Granativa. Rápido, sem abrir o app.
            </Text>

            <Text style={paragraph}>
              Precisa de ajuda? É só responder este email ou falar com a gente em{' '}
              <Link href="mailto:suporte@granativa.com.br">suporte@granativa.com.br</Link>.
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
  background: 'linear-gradient(140deg, #EE5524 0%, #F47B3D 100%)',
  padding: '32px 28px',
};

const title: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: '22px',
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

const steps: React.CSSProperties = {
  margin: '12px 0 24px',
};

const stepDot: React.CSSProperties = {
  width: '28px',
  height: '28px',
  backgroundColor: '#FEF0EB',
  borderRadius: '50%',
  textAlign: 'center',
  verticalAlign: 'middle',
  marginRight: '12px',
};

const dotText: React.CSSProperties = {
  color: '#EE5524',
  fontWeight: 800,
  fontSize: '14px',
  lineHeight: '28px',
  margin: 0,
};

const stepText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.5,
  color: '#1C1814',
  margin: '0 0 12px',
  paddingTop: '4px',
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

import {
  Html, Body, Container, Heading, Text, Link, Section, Button
} from '@react-email/components';

interface FollowUpEmailProps {
  name: string;
}

export function FollowUpEmail({ name }: FollowUpEmailProps) {
  return (
    <Html lang="pt-BR">
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>Já deu uma olhada na Granativa, {name}?</Heading>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Sua conta foi criada há 3 dias — a gente sabe que a correria é grande,
              mas queria ver se você já experimentou lançar sua primeira transação.
            </Text>

            <Text style={paragraph}>
              A Granativa foi feita pra ser rápida: abrir, digitar o valor, salvar.
              É o jeito mais direto de saber pra onde seu dinheiro vai, sem planilha,
              sem app pesado, sem esperar sincronizar.
            </Text>

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href="https://granativa.com.br/app" style={button}>
                Abrir Granativa
              </Button>
            </Section>

            <Text style={paragraph}>
              Ah, e funciona offline. Se você estiver no metrô, no elevador, na praia —
              lançou, salvou. Quando o sinal voltar, sincroniza sozinho.
            </Text>

            <Text style={paragraph}>
              Dúvida? É só responder aqui ou falar com a gente em{' '}
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
  background: 'linear-gradient(140deg, #2EAE7D 0%, #36C18C 100%)',
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

const button: React.CSSProperties = {
  backgroundColor: '#EE5524',
  color: '#FFFFFF',
  padding: '12px 28px',
  borderRadius: '10px',
  fontWeight: 800,
  fontSize: '15px',
  textDecoration: 'none',
  display: 'inline-block',
  fontFamily: "'Instrument Sans', system-ui, sans-serif",
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

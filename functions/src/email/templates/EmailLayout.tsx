import {
  Html, Head, Preview, Body, Container, Section, Heading, Img, Text
} from '@react-email/components';

// Logo horizontal (colorido, fundo transparente) servido pelo hosting de produção.
// Fica bem numa faixa BRANCA — sobre o tangerina o símbolo/wordmark tangerina sumiria.
const LOGO_URL = 'https://granativa.com.br/brand/granativa-logo-horizontal.png';
const TANGERINE = 'linear-gradient(140deg, #EE5524 0%, #F47B3D 100%)';

interface EmailLayoutProps {
  /** Texto de preview do inbox (a prévia cinza ao lado do assunto). */
  preview: string;
  /** Título grande na faixa de saudação. */
  title: string;
  /** Gradiente da faixa de saudação (default: tangerina da marca). */
  accent?: string;
  children: React.ReactNode;
}

/**
 * Casca compartilhada de todos os emails: logo numa faixa branca no topo, faixa de saudação
 * colorida, conteúdo e rodapé. Antes cada template duplicava ~50 linhas de estilo e nenhum
 * tinha logo.
 */
export function EmailLayout({ preview, title, accent, children }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={logoBar}>
            <Img src={LOGO_URL} width="164" height="55" alt="Granativa" style={logoImg} />
          </Section>

          <Section style={{ ...greeting, background: accent ?? TANGERINE }}>
            <Heading style={greetingTitle}>{title}</Heading>
          </Section>

          <Section style={content}>{children}</Section>

          <Section style={footer}>
            <Text style={footerBrand}>Granativa — Controle individual. Organização a dois.</Text>
            <Text style={footerMuted}>
              Você recebeu este email porque tem (ou teve) uma conta na Granativa.
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
  margin: 0,
  padding: '24px 0',
};

const container: React.CSSProperties = {
  maxWidth: '480px',
  margin: '0 auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  overflow: 'hidden',
  boxShadow: '0 4px 16px rgba(28, 24, 20, 0.08)',
};

const logoBar: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  padding: '26px 28px 20px',
  textAlign: 'center',
};

const logoImg: React.CSSProperties = {
  margin: '0 auto',
  display: 'block',
};

const greeting: React.CSSProperties = {
  padding: '26px 28px',
};

const greetingTitle: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: '21px',
  fontWeight: 800,
  margin: 0,
  lineHeight: 1.25,
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const content: React.CSSProperties = {
  padding: '28px',
};

const footer: React.CSSProperties = {
  padding: '18px 28px 24px',
  borderTop: '1px solid #EEE8E0',
  textAlign: 'center',
};

const footerBrand: React.CSSProperties = {
  fontSize: '12px',
  color: '#8A7A72',
  fontWeight: 600,
  margin: '0 0 4px',
};

const footerMuted: React.CSSProperties = {
  fontSize: '11px',
  color: '#B4A79F',
  margin: 0,
};

// Estilos de conteúdo reaproveitáveis pelos templates (parágrafo e link padrão).
export const emailParagraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  color: '#1C1814',
  margin: '0 0 16px',
};

export const emailLink: React.CSSProperties = {
  color: '#EE5524',
  fontWeight: 600,
  textDecoration: 'underline',
};

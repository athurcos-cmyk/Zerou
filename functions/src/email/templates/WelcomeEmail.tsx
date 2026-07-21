import { Text, Link, Section, Row, Column } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface WelcomeEmailProps {
  name: string;
}

const STEPS = [
  'Lance sua primeira transação — é rápido, comece pelo valor.',
  'Cadastre seu cartão de crédito pra ver o que já está comprometido.',
  'Adicione suas contas recorrentes (assinaturas, aluguel) pra não ser pego de surpresa.',
];

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Sua conta na Granativa está pronta — veja por onde começar."
      title={`Bem-vindo à Granativa, ${name}!`}
    >
      <Text style={emailParagraph}>
        Sua conta foi criada e seu espaço pessoal está pronto. A Granativa te ajuda a saber
        pra onde vai seu dinheiro — direto no celular, mesmo offline.
      </Text>

      <Text style={{ ...emailParagraph, fontWeight: 700, margin: '0 0 14px' }}>
        Por onde começar:
      </Text>

      <Section style={stepsWrap}>
        {STEPS.map((text, i) => (
          <Row key={text}>
            <Column style={dotColumn}>
              {/* Círculo à prova de email: tabela isolada de 30x30 (não estica com o texto,
                  que era o bug do <td> com border-radius sem altura fixa). */}
              <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                <tbody>
                  <tr>
                    <td width="30" height="30" style={dotCell}>{i + 1}</td>
                  </tr>
                </tbody>
              </table>
            </Column>
            <Column style={stepTextColumn}>
              <Text style={stepText}>{text}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      <Text style={emailParagraph}>
        E se preferir, lance transações direto pelo WhatsApp. É só mandar uma mensagem como
        "gastei 47 no mercado" pro número da Granativa. Rápido, sem abrir o app.
      </Text>

      <Text style={emailParagraph}>
        Precisa de ajuda? É só responder este email ou falar com a gente em{' '}
        <Link href="mailto:suporte@granativa.com.br" style={emailLink}>suporte@granativa.com.br</Link>.
      </Text>
    </EmailLayout>
  );
}

const stepsWrap: React.CSSProperties = {
  margin: '4px 0 22px',
};

const dotColumn: React.CSSProperties = {
  width: '44px',
  verticalAlign: 'top',
  paddingBottom: '14px',
};

const stepTextColumn: React.CSSProperties = {
  verticalAlign: 'top',
  paddingBottom: '14px',
};

const dotCell: React.CSSProperties = {
  width: '30px',
  height: '30px',
  backgroundColor: '#FEF0EB',
  borderRadius: '50%',
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#EE5524',
  fontWeight: 800,
  fontSize: '15px',
  lineHeight: '30px',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const stepText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.5,
  color: '#1C1814',
  margin: 0,
  paddingTop: '5px',
};

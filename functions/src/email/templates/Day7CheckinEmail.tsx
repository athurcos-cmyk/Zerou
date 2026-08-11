import { Text, Link, Section, Button } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface Day7CheckinEmailProps {
  name: string;
  activated: boolean;
}

const BLUE = 'linear-gradient(140deg, #3D7BEE 0%, #5B93F5 100%)';

export function Day7CheckinEmail({ name, activated }: Day7CheckinEmailProps) {
  if (activated) {
    return (
      <EmailLayout
        preview="Você já começou — aqui vai um atalho que pode ajudar ainda mais."
        title={`Boa, ${name}! Uma dica pra ir além`}
        accent={BLUE}
      >
        <Text style={emailParagraph}>
          Faz uma semana que você está na Granativa e já lançou alguma coisa — é exatamente esse
          hábito que faz o mês fazer sentido no fim das contas.
        </Text>

        <Text style={emailParagraph}>
          Se ainda não experimentou, cadastre seu cartão de crédito: você vê quanto já está
          comprometido na fatura antes dela fechar, sem precisar abrir o extrato do banco.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href="https://granativa.com.br/app" style={button}>
            Abrir Granativa
          </Button>
        </Section>

        <Text style={emailParagraph}>
          Dúvida? É só responder este email ou falar com a gente em{' '}
          <Link href="mailto:suporte@granativa.com.br" style={emailLink}>suporte@granativa.com.br</Link>.
        </Text>
      </EmailLayout>
    );
  }

  return (
    <EmailLayout
      preview="Ainda não vimos nenhum lançamento seu — sem julgamento, só queríamos entender."
      title={`Posso te ajudar a começar, ${name}?`}
    >
      <Text style={emailParagraph}>
        Faz uma semana que você criou sua conta na Granativa e ainda não vimos nenhum lançamento
        por aqui. Sem problema — só queríamos entender se travou em alguma coisa.
      </Text>

      <Text style={emailParagraph}>
        Se pareceu trabalhoso abrir o app, tem um jeito mais rápido: manda uma mensagem pro
        WhatsApp da Granativa, tipo "gastei 40 no mercado", e a Vic lança pra você. Sem abrir nada.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href="https://granativa.com.br/app" style={button}>
          Abrir Granativa
        </Button>
      </Section>

      <Text style={emailParagraph}>
        E se travou em outra coisa, me conta — é só responder este email ou escrever pra{' '}
        <Link href="mailto:suporte@granativa.com.br" style={emailLink}>suporte@granativa.com.br</Link>.
        A gente lê tudo.
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

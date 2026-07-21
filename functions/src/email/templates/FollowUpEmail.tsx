import { Text, Link, Section, Button } from '@react-email/components';
import { EmailLayout, emailParagraph, emailLink } from './EmailLayout.js';

interface FollowUpEmailProps {
  name: string;
}

const GREEN = 'linear-gradient(140deg, #2EAE7D 0%, #36C18C 100%)';

export function FollowUpEmail({ name }: FollowUpEmailProps) {
  return (
    <EmailLayout
      preview="Que tal lançar sua primeira transação? Leva menos de um minuto."
      title={`Já deu uma olhada na Granativa, ${name}?`}
      accent={GREEN}
    >
      <Text style={emailParagraph}>
        Sua conta foi criada há 3 dias — a gente sabe que a correria é grande, mas queria ver
        se você já experimentou lançar sua primeira transação.
      </Text>

      <Text style={emailParagraph}>
        A Granativa foi feita pra ser rápida: abrir, digitar o valor, salvar. É o jeito mais
        direto de saber pra onde seu dinheiro vai, sem planilha, sem app pesado, sem esperar
        sincronizar.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href="https://granativa.com.br/app" style={button}>
          Abrir Granativa
        </Button>
      </Section>

      <Text style={emailParagraph}>
        Tem também o WhatsApp. Mande uma mensagem como "gastei 47 no mercado" pro número da
        Granativa e pronto — lançou sem abrir o app.
      </Text>

      <Text style={emailParagraph}>
        E funciona offline. Se você estiver no metrô, no elevador, na praia — lançou, salvou.
        Quando o sinal voltar, sincroniza sozinho.
      </Text>

      <Text style={emailParagraph}>
        Dúvida? É só responder aqui ou falar com a gente em{' '}
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

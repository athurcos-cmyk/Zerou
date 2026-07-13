import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function AssistantPage() {
  const { profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    if (!workspaceId) {
      setError('Conclua seu cadastro antes de usar o assistente.');
      return;
    }

    setInput('');
    setError(null);

    const history = [...messages];
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const fn = httpsCallable<{
        workspaceId: string;
        message: string;
        history: Array<{ role: 'user' | 'assistant'; content: string }>;
      }, { reply: string }>(getFirebaseFunctions(), 'financialAssistantChat');

      const result = await fn({ workspaceId, message: text, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.data.reply }]);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Não consegui responder agora. Tente de novo.'));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="assistant-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Assistente</p>
          <h1>Grazi</h1>
        </div>
      </header>

      <div className="assistant-chat" ref={listRef}>
        {messages.length === 0 && !loading ? (
          <div className="assistant-welcome">
            <div className="assistant-welcome-icon">
              <Sparkles size={32} aria-hidden="true" />
            </div>
            <p className="assistant-welcome-title">Como posso ajudar?</p>
            <p className="text-secondary">
              Pergunte sobre seus gastos, categorias ou peça dicas para organizar suas finanças.
            </p>
            <div className="assistant-suggestions">
              {[
                'Onde gastei mais esse mês?',
                'Minhas contas estão sob controle?',
                'Me dê uma dica para economizar',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="assistant-suggestion-chip"
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`assistant-bubble ${msg.role === 'user' ? 'assistant-bubble--user' : 'assistant-bubble--assistant'}`}
            >
              <p>{msg.content}</p>
            </div>
          ))
        )}

        {loading ? (
          <div className="assistant-bubble assistant-bubble--assistant">
            <p className="assistant-typing">Pensando...</p>
          </div>
        ) : null}

        {error ? (
          <div className="assistant-bubble assistant-bubble--error">
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      <form className="assistant-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="input"
          placeholder="Pergunte sobre suas finanças..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          type="submit"
          className="icon-button"
          aria-label="Enviar"
          disabled={loading || !input.trim()}
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

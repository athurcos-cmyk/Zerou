interface FormMessageProps {
  type?: 'success' | 'danger';
  children?: string | null;
}

export function FormMessage({ type = 'danger', children }: FormMessageProps) {
  if (!children) {
    return null;
  }

  return (
    <div className={`notice notice--${type}`} role={type === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Input, type InputProps } from './Form';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Campo monetário em Real: o usuário digita apenas números e o valor é
 * preenchido da direita para a esquerda (centavos), como em apps bancários.
 */
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<InputProps, 'value' | 'onChange'> & { value: number; onValueChange: (v: number) => void }) {
  const [texto, setTexto] = useState(fmt.format(value || 0));

  useEffect(() => {
    setTexto(fmt.format(value || 0));
  }, [value]);

  return (
    <Input
      inputMode="numeric"
      leftIcon={<span className="text-xs font-medium">R$</span>}
      value={texto}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '').slice(0, 12);
        const v = Number(digitos || '0') / 100;
        setTexto(fmt.format(v));
        onValueChange(v);
      }}
      onFocus={(e) => e.target.select()}
      className="tabular text-right"
      {...props}
    />
  );
}

const ROWS = [
  {
    cmd: 'confirmar [nome] [horário] [duração]',
    oque: 'Confirma agendamento pendente',
    ex: 'confirmar João 09:00 2h',
  },
  {
    cmd: 'sugerir [nome] [horário]',
    oque: 'Sugere outro horário',
    ex: 'sugerir João 14:00',
  },
  { cmd: 'agenda hoje', oque: 'Lista agendamentos de hoje', ex: '—' },
  { cmd: 'agenda semana', oque: 'Lista agendamentos da semana', ex: '—' },
  {
    cmd: 'encaixar [horário] [nome] [serviço]',
    oque: 'Cria agendamento rápido',
    ex: 'encaixar 10:00 Maria alinhamento',
  },
  {
    cmd: '+servico [nome] [categoria] [preço]',
    oque: 'Cadastra serviço',
    ex: '+servico alinhamento carro 80',
  },
  { cmd: 'servicos', oque: 'Lista serviços cadastrados', ex: '—' },
  { cmd: 'pendentes', oque: 'Lista solicitações aguardando', ex: '—' },
];

export function ComandosGuia() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-lg font-semibold text-white">Guia de Comandos do Operador (via WhatsApp)</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-4">Comando</th>
              <th className="pb-2 pr-4">O que faz</th>
              <th className="pb-2">Exemplo</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.cmd} className="border-b border-white/5">
                <td className="py-3 pr-4 font-mono text-emerald-400">{r.cmd}</td>
                <td className="py-3 pr-4 text-zinc-300">{r.oque}</td>
                <td className="py-3 font-mono text-zinc-500">{r.ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

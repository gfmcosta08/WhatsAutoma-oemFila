'use strict';

function menuSemAgendamento(nomeMarca) {
  const m = nomeMarca || 'Lavajato';
  return `*${m}*\n\n1) Agendar lavagem\n2) Falar com atendente\n3) Encerrar`;
}

function menuComAgendamento(nomeMarca) {
  const m = nomeMarca || 'Lavajato';
  return (
    `*${m}*\n\n` +
    `Você tem um agendamento ativo.\n\n` +
    `1) Ver dados\n` +
    `2) Reagendar\n` +
    `3) Cancelar\n` +
    `4) Voltar ao menu principal`
  );
}

function confirmarAgendamento({ horarioLabel, descricao }) {
  return `Confirma o agendamento?\n\nServiço: ${descricao}\nHorário: ${horarioLabel}\n\n1) Sim\n2) Não`;
}

module.exports = { menuSemAgendamento, menuComAgendamento, confirmarAgendamento };

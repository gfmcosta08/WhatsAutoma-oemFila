'use strict';

const reposLavajato = require('./database/reposLavajato');
const { sendTextNotify } = require('./whatsapp/notify');

async function textoNaFila(row) {
  const pos = await reposLavajato.posicaoNaFila(row.id);
  return `🟡 Seu veículo chegou! Você está na posição ${pos} da fila.`;
}

const TEXTO_FIXO = {
  lavando: '🔵 Seu carro entrou para lavagem agora. Já estamos cuidando dele!',
  finalizando: '🟠 Quase pronto! Seu veículo está na fase final de secagem e acabamento.',
  pronto: '🟢 Seu carro está prontinho te esperando! Pode vir buscar.',
};

/**
 * Dispara WhatsApp ao cliente quando o painel altera status_fila (PRD §3.2).
 */
async function notificarMudancaFila(rowCompleto, statusNovo) {
  if (!statusNovo) return;
  const tel = rowCompleto.cliente_telefone || rowCompleto.telefone;
  if (!tel) return;

  let texto;
  if (statusNovo === 'na_fila') texto = await textoNaFila(rowCompleto);
  else texto = TEXTO_FIXO[statusNovo];
  if (!texto) return;

  await sendTextNotify(tel, texto);
}

module.exports = { notificarMudancaFila };

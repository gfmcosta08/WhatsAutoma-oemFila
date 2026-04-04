export type Pendente = {
  id: number;
  cliente_nome: string;
  cliente_jid: string;
  horario_escolhido: string;
  descricao: string;
  data_criacao: string;
};

export type Agendamento = {
  id: string; // UUID no banco
  cliente_nome: string;
  data_hora: string;
  duracao: string;
  status: string;
  descricao_problema: string;
  status_fila?: string | null;
  origem?: string;
  veiculo_placa?: string | null;
  veiculo_modelo?: string | null;
};

export type AgendamentoServico = {
  id: number;
  nome: string;
  categoria: string;
  preco: number;
  descricao: string;
};

export type AgendamentoConfig = {
  id: number;
  empresa_id: number;
  phone_number_id: number | null;
  phone_number_numero: string | null;
  jid_operador: string;
  horarios_disponiveis: { dia: string; hora: string }[];
  mensagem_boas_vindas: string;
  aprovacao_automatica?: boolean;
  vagas_por_slot?: number;
  horarios_bloqueados?: string[];
  painel_auth_enabled?: boolean;
  login_mode?: string;
  usuarios_cadastrados?: number;
  whatsapp_provider?: string;
  /** false = sem token Meta ou token de instância UazAPI para enviar mensagens */
  whatsapp_pode_enviar?: boolean;
};

export type AccessFlags = {
  enable_agendamento: boolean;
  is_superadmin: boolean;
};

export type EmpresaCadastro = {
  id: number;
  nome: string;
  email: string | null;
  cnpj: string | null;
  status: string;
  webhook_url: string;
  created_at: string;
};

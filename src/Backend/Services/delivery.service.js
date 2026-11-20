export function calcularStatusEntrega({ quantidade, recebida, dataPrevista, cancelada = false, agora = new Date() }) {
  if (cancelada) return "CANCELADA";
  if (Number(recebida) >= Number(quantidade)) return "ENTREGUE";
  if (dataPrevista && new Date(dataPrevista) < agora) return "ATRASADA";
  if (Number(recebida) > 0) return "PARCIALMENTE_ENTREGUE";
  return "PENDENTE";
}

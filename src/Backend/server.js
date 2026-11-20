
import server from './app';
import {prisma} from './prisma/lib/prisma'
import { processarNotificacoesPendentes, verificarAlertasEntrega } from './Services/notification.service.js'

async function iniciarServico(){
    try{

    await prisma.$queryRaw`SELECT 1`;
    console.log("Banco de dados conectado!");

    const port = Number(process.env.PORT) || 3000;
    server.listen(port,()=>{
    console.log(`Servidor ouvindo na porta ${port}`)})

    const notificationWorker = setInterval(async () => {
        try { await processarNotificacoesPendentes(); await verificarAlertasEntrega(); }
        catch (erro) { console.error("Falha no processamento de notificacoes:", erro.message); }
    }, 60_000);
    notificationWorker.unref();

    }catch(erro) {
        console.error("Erro ao conectar ao banco:", erro);

    }
}

iniciarServico();

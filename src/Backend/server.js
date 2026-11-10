
import server from './app';
import {prisma} from './prisma/lib/prisma'

async function iniciarServico(){
    try{

    await prisma.$queryRaw`SELECT 1`;
    console.log("Banco de dados conectado!");

    const port = Number(process.env.PORT) || 3000;
    server.listen(port,()=>{
    console.log(`Servidor ouvindo na porta ${port}`)})

    }catch(erro) {
        console.error("Erro ao conectar ao banco:", erro);

    }
}

iniciarServico();

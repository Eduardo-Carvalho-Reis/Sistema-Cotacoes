
import server from './app';
import {prisma} from './prisma/lib/prisma'

async function iniciarServico(){
    try{

    await prisma.$queryRaw`SELECT 1`;
    console.log("Banco de dados conectado!");

    server.listen(3000,()=>{
    console.log("sevidor ouvindo")})

    }catch(erro) {
        console.error("Erro ao conectar ao banco:", erro);

    }
}

iniciarServico();

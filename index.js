// Importando as dependências necessárias
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const mysql = require('mysql2/promise');
const { format } = require('date-fns');
const FormData = require('form-data');
require('dotenv').config(); // Carregar variáveis de ambiente do arquivo .env

// Criando uma nova instância do cliente do Discord
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Token do bot e ID do administrador
const token = process.env.DISCORD_TOKEN;
const adminUserId = process.env.ADMIN_USER_ID;

// Configurar conexão com o banco de dados MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Função para criar a tabela game_requests se não existir
async function createTable() {
    try {
        const connection = await db.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS game_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255),
                username VARCHAR(255),
                games_list TEXT,
                timestamp DATETIME
            )
        `);
        console.log('Table game_requests is ready.');
        connection.release();
    } catch (err) {
        console.error('Error creating table:', err);
    }
}

// Teste a Conexão e crie a tabela
db.getConnection()
    .then(() => {
        console.log('Connected to the MySQL database.');
        return createTable();
    })
    .catch(err => {
        console.error('Error connecting to the MySQL database:', err);
    });

// Função para registrar mensagens
async function logMessage(user, message) {
    const logFile = 'message_logs.json';
    let logs = [];

    if (fs.existsSync(logFile)) {
        const data = fs.readFileSync(logFile);
        logs = JSON.parse(data);
    }

    logs.push({
        user: user.tag,
        message: message,
        timestamp: new Date().toISOString()
    });

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

// Função para criar ou reutilizar um canal privado
async function createOrGetPrivateChannel(guild, user) {
    let channel = guild.channels.cache.find(c => c.name === `support-${user.username}` && c.type === 0);

    if (!channel) {
        channel = await guild.channels.create({
            name: `support-${user.username}`,
            type: 0,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: adminUserId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: client.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });
    }

    return channel;
}

// Map para gerenciar os timers ativos
const activeTimers = new Map();
// Set para evitar processamento duplicado de mensagens
const processedMessages = new Set();

// Evento disparado quando o bot está pronto
client.once('ready', () => {
    console.log('Bot is online!');
});

// Evento disparado quando uma mensagem é criada
client.on('messageCreate', async message => {
    if (message.content.toLowerCase() === '!service') {
        const privateChannel = await createOrGetPrivateChannel(message.guild, message.author);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('sell')
                    .setLabel('Sell')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('trade')
                    .setLabel('Trade')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('buy')
                    .setLabel('Buy')
                    .setStyle(ButtonStyle.Success)
            );

        await privateChannel.send({
            content: 'Hello! How may I help you?',
            components: [row]
        });

        logMessage(message.author, message.content);

        if (activeTimers.has(privateChannel.id)) {
            clearTimeout(activeTimers.get(privateChannel.id));
        }

        const timeoutId = setTimeout(async () => {
            if (client.channels.cache.has(privateChannel.id)) {
                await privateChannel.send('Thank you and until next time!');
            }
            activeTimers.delete(privateChannel.id);
        }, 30 * 60 * 1000);

        activeTimers.set(privateChannel.id, timeoutId);
    } else if (message.channel.type === 'DM' && !message.author.bot) {
        logMessage(message.author, message.content);
    } else if (message.channel.name.startsWith('support-') && !message.author.bot) {
        if (activeTimers.has(message.channel.id)) {
            clearTimeout(activeTimers.get(message.channel.id));

            const timeoutId = setTimeout(async () => {
                if (client.channels.cache.has(message.channel.id)) {
                    await message.channel.send('Thank you and until next time!');
                }
                activeTimers.delete(message.channel.id);
            }, 30 * 60 * 1000);

            activeTimers.set(message.channel.id, timeoutId);
        }
    }
});

// Evento disparado quando uma mensagem é criada
client.on('messageCreate', async message => {
    if (message.attachments.size > 0 && message.channel.name.startsWith('support-')) {
        if (processedMessages.has(message.id)) {
            return; // Evitar processar a mesma mensagem mais de uma vez
        }

        processedMessages.add(message.id);

        const attachment = message.attachments.first();
        if (attachment.name.endsWith('.txt')) {
            try {
                const response = await fetch(attachment.url);
                const text = await response.text();

                // Divida o texto em linhas
                const lines = text.split('\n');

                // Formatar o timestamp
                const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

                // Salvar no banco de dados
                await db.execute(`INSERT INTO game_requests (user_id, username, games_list, timestamp) VALUES (?, ?, ?, ?)`, [
                    message.author.id,
                    message.author.tag,
                    lines.join(', '), // Salve as linhas como uma única string separada por vírgulas
                    timestamp
                ]);

                // Criar form data
                const formData = new FormData();
                formData.append('fileToUpload', Buffer.from(text, 'utf-8'), {
                    filename: attachment.name,
                    contentType: 'text/plain'
                });

                // Enviar o arquivo para o endpoint web e receber a resposta
                const uploadResponse = await axios.post('http://191.101.70.89:5555/upload', formData, {
                    headers: formData.getHeaders(),
                    responseType: 'arraybuffer' // Espera um ArrayBuffer na resposta
                });

                const buffer = Buffer.from(uploadResponse.data);

                if (buffer.length === 0) {
                    await message.reply({
                        content: 'Arquivo processado e a resposta foi recebida com sucesso!\nPrecisa de mais alguma ajuda?'
                    });
                    return;
                }

                // Salvar o arquivo recebido
                const filePath = `response_${message.id}.txt`;
                fs.writeFileSync(filePath, buffer);

                // Enviar o arquivo de resposta para o usuário no Discord
                await message.reply({
                    content: 'Arquivo processado e a resposta foi recebida com sucesso!\nPrecisa de mais alguma ajuda?',
                    files: [filePath]
                });

                // Excluir o arquivo temporário
                fs.unlinkSync(filePath);

            } catch (err) {
                console.error('Erro ao salvar no banco de dados ou enviar o arquivo', err);
                await message.reply('Houve um erro ao processar seu arquivo.');
            } finally {
                processedMessages.delete(message.id);
            }
        } else {
            await message.reply('Por favor, envie um arquivo .txt');
        }
    }
});

// Evento disparado quando uma interação é criada
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const createBackButton = (previousMenuId) => {
        return new ButtonBuilder()
            .setCustomId(previousMenuId)
            .setLabel('Back')
            .setStyle(ButtonStyle.Danger);
    };

    let responseMessage = '';
    let row;

    switch (interaction.customId) {
        case 'sell':
            row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('choices')
                        .setLabel('Choices')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('bundles')
                        .setLabel('Bundles')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('single_games')
                        .setLabel('Single Games and Lists')
                        .setStyle(ButtonStyle.Success),
                    createBackButton('back_to_main')
                );
            responseMessage = 'You chose to sell. Select one of the options:';
            break;
        case 'choices':
            row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('current_choice')
                        .setLabel('Current Choice')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('previous_choices')
                        .setLabel('Previous Choices')
                        .setStyle(ButtonStyle.Secondary),
                    createBackButton('sell')
                );
            responseMessage = 'You chose Choices. Select one of the options:';
            break;
        case 'bundles':
            row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('humble_bundle')
                        .setLabel('Humble Bundle')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('fanatical')
                        .setLabel('Fanatical')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('others')
                        .setLabel('Others')
                        .setStyle(ButtonStyle.Success),
                    createBackButton('sell')
                );
            responseMessage = 'You chose Bundles. Select one of the options:';
            break;
        case 'single_games':
            responseMessage = 'You chose Single Games and Lists. Please send the games in a TXT file.';
            row = new ActionRowBuilder().addComponents(createBackButton('sell'));
            break;
        case 'trade':
            row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('resources')
                        .setLabel('Resources for Resources')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('games_for_games')
                        .setLabel('Games for Games')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('resources_for_gift_cards')
                        .setLabel('Resources for Gift Cards')
                        .setStyle(ButtonStyle.Success),
                    createBackButton('back_to_main')
                );
            responseMessage = 'You chose to trade. Select one of the options:';
            break;
        case 'buy':
            responseMessage = 'You chose to buy. Send me more details about what you want to buy.';
            row = new ActionRowBuilder().addComponents(createBackButton('back_to_main'));
            break;
        case 'back_to_main':
            row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('sell')
                        .setLabel('Sell')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('trade')
                        .setLabel('Trade')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('buy')
                        .setLabel('Buy')
                        .setStyle(ButtonStyle.Success)
                );
            responseMessage = 'Hello! How may I help you?';
            break;
        default:
            row = new ActionRowBuilder()
                .addComponents(createBackButton('back_to_main'));
            responseMessage = 'Invalid action';
            break;
    }

    await interaction.update({ content: responseMessage, components: [row], ephemeral: true });

    logMessage(interaction.user, responseMessage);
});

// Log the bot in
client.login(token);

// Importar a biblioteca discord.js e fs
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], 
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] 
});

// Token do bot e ID do administrador
require('dotenv').config(); // Carregar as variáveis de ambiente do arquivo .env
const token = process.env.DISCORD_TOKEN;
const adminUserId = process.env.ADMIN_USER_ID;

// Função para registrar mensagens
function logMessage(user, message) {
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

// Quando o bot estiver pronto
client.once('ready', () => {
    console.log('Bot is online!');
});

// Função para criar um canal privado
async function createPrivateChannel(guild, user) {
    const channelName = `support-${user.username}`;
    const channel = await guild.channels.create({
        name: channelName,
        type: 0, // Tipo de canal: 0 é um canal de texto
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
                id: adminUserId, // Certifique-se de que adminUserId seja tratado como string
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            },
            {
                id: client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            },
        ],
    });

    return channel;
}

// Quando uma mensagem é enviada no canal
client.on('messageCreate', async message => {
    if (message.content.toLowerCase() === '!service') {
        const privateChannel = await createPrivateChannel(message.guild, message.author);

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
    } else if (message.channel.type === 'DM' && !message.author.bot) {
        logMessage(message.author, message.content);
    }
});

// Quando uma interação é criada (botões)
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

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { clientsArray } from './sessionUtil';
import api from 'axios';

// Konfigurasi koneksi Redis
// Pastikan server Redis sudah menyala di localhost:6379
const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
});

// 1. Antrean (Queue) untuk Pengiriman Pesan
export const messageQueue = new Queue('messageQueue', { connection });

export const messageWorker = new Worker(
  'messageQueue',
  async (job) => {
    const { session, contact, message, options } = job.data;
    const client = clientsArray[session];

    if (!client) {
      throw new Error(`Sesi WhatsApp ${session} tidak aktif atau belum siap.`);
    }

    // Proses pengiriman pesan sebenarnya melalui WPPConnect
    const result = await client.sendText(contact, message, options);
    return result;
  },
  {
    connection,
    concurrency: 3, // Membatasi maksimal 3 pengiriman pesan simultan untuk menghemat CPU
  }
);

messageWorker.on('completed', (job) => {
  console.log(
    `[Queue - SUCCESS] Pesan ke ${job.data.contact} (Sesi: ${job.data.session}) berhasil dikirim.`
  );
});

messageWorker.on('failed', (job, err) => {
  console.error(
    `[Queue - FAILED] Pesan ke ${job?.data.contact} gagal:`,
    err.message
  );
});

// 2. Antrean (Queue) untuk Webhook (Background Async)
// Agar saat ada event message masuk, tidak memblokir antrean event loop Node.js utama
export const webhookQueue = new Queue('webhookQueue', { connection });

export const webhookWorker = new Worker(
  'webhookQueue',
  async (job) => {
    const { webhookUrl, data, event, session, readMessage } = job.data;

    try {
      await api.post(webhookUrl, data);

      // Logic tambahan (misal otomatis read/sendSeen setelah webhook sukses)
      const client = clientsArray[session];
      if (client) {
        const events = ['unreadmessages', 'onmessage'];
        if (events.includes(event) && readMessage) {
          const chatId = data.from || data.chatId?._serialized;
          if (chatId) client.sendSeen(chatId);
        }
      }
    } catch (error: any) {
      console.warn(
        `[Webhook Queue] Error mengirim webhook ke ${webhookUrl}:`,
        error.message
      );
      throw error; // Biarkan BullMQ melakukan retry jika diperlukan
    }
  },
  {
    connection,
    concurrency: 10, // Bisa melayani hingga 10 webhook bersamaan
  }
);

webhookWorker.on('completed', (job) => {
  // console.log(`[Webhook Queue] Webhook ${job.data.event} terkirim sukses.`);
});

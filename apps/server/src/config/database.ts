import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const mysqlUrl = process.env.MYSQL_URL;

let pool: mysql.Pool | null = null;

if (mysqlUrl) {
  try {
    pool = mysql.createPool({
      uri: mysqlUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
    console.log('✅ MySQL 连接池已初始化');
  } catch (err) {
    console.warn('⚠️ MySQL 连接池创建失败，将使用内存存储作为回退模式', err);
  }
} else {
  console.warn('⚠️ 未检测到 MYSQL_URL 环境变量，使用内存存储模式');
}

export const dbPool = pool;

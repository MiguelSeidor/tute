import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/stats/ranking — Top 20 players by wins
router.get('/ranking', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const ranking = await prisma.$queryRaw<
      { userId: string; username: string; wins: bigint; gamesPlayed: bigint }[]
    >`
      SELECT gp."userId", u.username,
        COUNT(*) FILTER (WHERE gp."isWinner" = true) AS wins,
        COUNT(*) AS "gamesPlayed"
      FROM game_players gp
      JOIN users u ON u.id = gp."userId"
      GROUP BY gp."userId", u.username
      ORDER BY wins DESC, "gamesPlayed" ASC
      LIMIT 20
    `;

    res.json({
      ranking: ranking.map(r => ({
        userId: r.userId,
        username: r.username,
        wins: Number(r.wins),
        gamesPlayed: Number(r.gamesPlayed),
        winRate: Number(r.gamesPlayed) > 0
          ? Math.round((Number(r.wins) / Number(r.gamesPlayed)) * 100)
          : 0,
      })),
    });
  } catch (error) {
    console.error('Error en ranking:', error);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});

// GET /api/stats/history — Game history for authenticated user
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const myGames = await prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { completedAt: 'desc' } },
      take: 20,
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { username: true } } },
            },
          },
        },
      },
    });

    res.json({
      games: myGames.map(gp => ({
        id: gp.game.id,
        roomName: gp.game.roomName,
        piedrasCount: gp.game.piedrasCount,
        completedAt: gp.game.completedAt.toISOString(),
        players: gp.game.players.map(p => ({
          username: p.user.username,
          isWinner: p.isWinner,
          finalPiedras: p.finalPiedras,
        })),
        myResult: gp.isWinner ? 'win' as const : 'loss' as const,
      })),
    });
  } catch (error) {
    console.error('Error en history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/stats/me — Personal stats for authenticated user
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const allGames = await prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { completedAt: 'desc' } },
      select: { isWinner: true },
    });

    const gamesPlayed = allGames.length;
    const wins = allGames.filter(g => g.isWinner).length;
    const losses = gamesPlayed - wins;
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

    // Current streak and best streak
    let currentStreak = 0;
    for (const g of allGames) {
      if (g.isWinner) currentStreak++;
      else break;
    }

    let bestStreak = 0;
    let streak = 0;
    for (const g of allGames) {
      if (g.isWinner) {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    }

    res.json({
      stats: { gamesPlayed, wins, losses, winRate, currentStreak, bestStreak },
    });
  } catch (error) {
    console.error('Error en stats/me:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/stats/dev/simulate — Inserta una partida ficticia para testing (solo desarrollo)
router.post('/dev/simulate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // Coger todos los usuarios registrados (hasta 4)
    const allUsers = await prisma.user.findMany({ take: 4, select: { id: true, username: true } });
    if (allUsers.length < 1) {
      res.status(400).json({ error: 'No hay usuarios registrados' });
      return;
    }

    // Rellenar hasta 4 jugadores (repitiendo el actual si hace falta)
    const me = allUsers.find(u => u.id === userId) || allUsers[0];
    while (allUsers.length < 4) {
      allUsers.push(me);
    }

    // Decidir ganador aleatorio (el usuario actual gana el 60% de las veces)
    const winnerIdx = Math.random() < 0.6 ? allUsers.findIndex(u => u.id === userId) : Math.floor(Math.random() * 4);

    await prisma.game.create({
      data: {
        roomName: `Test ${Date.now().toString(36)}`,
        piedrasCount: 5,
        players: {
          create: allUsers.map((u, i) => ({
            userId: u.id,
            seat: i,
            finalPiedras: i === winnerIdx ? 3 : 0,
            isWinner: i === winnerIdx,
          })),
        },
      },
    });

    res.json({ message: `Partida simulada. Ganador: ${allUsers[winnerIdx].username}` });
  } catch (error) {
    console.error('Error simulando partida:', error);
    res.status(500).json({ error: 'Error al simular partida' });
  }
});

export default router;

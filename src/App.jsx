import { useMemo, useState } from 'react'
import {
  MAX_SCORE,
  POSITION_LABELS,
  POSITION_ORDER,
  players,
  teams,
  matches,
} from './data'

function getPlayer(playerId) {
  return players.find((player) => player.id === playerId)
}

function getScore(team) {
  return POSITION_ORDER.reduce((sum, position) => {
    const playerId = team.players[position]
    const player = getPlayer(playerId)
    return sum + (player?.positions?.[position] ?? 0)
  }, 0)
}

function opggUrl(player) {
  return `https://op.gg/lol/summoners/kr/${encodeURIComponent(player.nickname)}-${encodeURIComponent(player.tag)}`
}

function getTeamStats(teamId) {
  const teamMatches = matches.filter(
    (match) => match.teamA === teamId || match.teamB === teamId,
  )

  let wins = 0

  for (const match of teamMatches) {
    const isA = match.teamA === teamId
    const ownScore = isA ? match.scoreA : match.scoreB
    const opponentScore = isA ? match.scoreB : match.scoreA

    if (ownScore > opponentScore) {
      wins += 1
    }
  }

  const sorted = [...teamMatches].sort((a, b) => b.date.localeCompare(a.date))
  const lastMatch = sorted[0] ?? null

  return {
    wins,
    matches: teamMatches,
    lastMatchDate: lastMatch?.date ?? null,
  }
}

function daysSince(dateString) {
  if (!dateString) return null

  const lastDate = new Date(`${dateString}T00:00:00`)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = todayStart.getTime() - lastDate.getTime()

  return Math.max(0, Math.floor(diff / 86400000))
}

function getTopWinTeams() {
  const teamStats = teams.map((team) => ({
    team,
    stats: getTeamStats(team.id),
  }))

  if (teamStats.length === 0) return []

  const maxWins = Math.max(...teamStats.map(({ stats }) => stats.wins))

  return teamStats
    .filter(({ stats }) => stats.wins === maxWins)
    .sort((a, b) => {
      const aDate = a.stats.lastMatchDate ?? ''
      const bDate = b.stats.lastMatchDate ?? ''
      return bDate.localeCompare(aDate)
    })
}

function getTopPlayersByAppearances() {
  const counts = new Map()

  for (const match of matches) {
    for (const teamId of [match.teamA, match.teamB]) {
      const team = teams.find((item) => item.id === teamId)
      if (!team) continue

      for (const position of POSITION_ORDER) {
        const playerId = team.players[position]
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1)
      }
    }
  }

  return [...counts.entries()]
    .map(([playerId, count]) => ({
      player: getPlayer(playerId),
      count,
    }))
    .filter((item) => item.player)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

function TeamCard({ team }) {
  const stats = getTeamStats(team.id)
  const score = getScore(team)
  const days = team.alive ? daysSince(stats.lastMatchDate) : null

  return (
    <article className="team-card">
      <div className="team-card-header">
        <div>
          <h3>{team.name}</h3>
          <div className="team-meta">
            <span className={team.alive ? 'status alive' : 'status dead'}>
              {team.alive ? '● 생존' : '● 해체'}
            </span>
            <span>{stats.wins}승</span>
            {team.alive && stats.lastMatchDate && (
              <span>마지막 경기 {days}일 전</span>
            )}
          </div>
        </div>

        <div className="team-total">
          <strong>{score}</strong>
          <span>점</span>
        </div>
      </div>

      <div className="team-roster">
        {POSITION_ORDER.map((position) => {
          const player = getPlayer(team.players[position])

          return (
            <div className="roster-row" key={position}>
              <span className="position-label">{POSITION_LABELS[position]}</span>
              <span className="player-name">{player?.name ?? '-'}</span>
              <span className="player-nick">{player?.nickname ?? '-'}</span>
              <span className="player-score">{player?.positions?.[position] ?? 0}</span>
            </div>
          )
        })}
      </div>

      <div className="match-list">
        {stats.matches.length === 0 ? (
          <div className="empty-small">아직 전적이 없습니다.</div>
        ) : (
          stats.matches
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((match) => {
              const isA = match.teamA === team.id
              const opponentId = isA ? match.teamB : match.teamA
              const ownScore = isA ? match.scoreA : match.scoreB
              const opponentScore = isA ? match.scoreB : match.scoreA
              const opponent = teams.find((item) => item.id === opponentId)
              const won = ownScore > opponentScore

              return (
                <div className="match-row" key={match.id}>
                  <span className="match-date">{match.date}</span>
                  <span>vs {opponent?.name ?? opponentId}</span>
                  <strong className={won ? 'win' : 'loss'}>
                    {ownScore} : {opponentScore} {won ? '승' : '패'}
                  </strong>
                </div>
              )
            })
        )}
      </div>
    </article>
  )
}

function App() {
  const [page, setPage] = useState('players')
  const [position, setPosition] = useState('top')
  const [selected, setSelected] = useState({})

  const currentScore = useMemo(
    () =>
      POSITION_ORDER.reduce((sum, pos) => {
        const player = getPlayer(selected[pos])
        return sum + (player?.positions?.[pos] ?? 0)
      }, 0),
    [selected],
  )

  const selectedComplete = POSITION_ORDER.every((pos) => selected[pos])

  const playersForPosition = players.filter(
    (player) =>
      player.active !== false && player.positions?.[position] !== undefined,
  )

  const topWinTeams = useMemo(() => getTopWinTeams(), [])
  const topPlayers = useMemo(() => getTopPlayersByAppearances(), [])

  function choosePlayer(pos, playerId) {
    setSelected((prev) => ({ ...prev, [pos]: playerId }))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">롤</div>
          <div>
            <h1>롤러가자 격전</h1>
          </div>
        </div>

        <nav className="main-nav">
          <button
            className={page === 'players' ? 'active' : ''}
            onClick={() => setPage('players')}
          >
            선수 명단
          </button>
          <button
            className={page === 'builder' ? 'active' : ''}
            onClick={() => setPage('builder')}
          >
            팀 만들기
          </button>
          <button
            className={page === 'teams' ? 'active' : ''}
            onClick={() => setPage('teams')}
          >
            팀 기록
          </button>
        </nav>
      </header>

      <main className="container">
        {page === 'players' && (
          <section>
            <div className="page-heading">
              <div>
                <span className="eyebrow">PLAYERS</span>
                <h2>포지션별 선수 명단</h2>
                <p>현재 모임에 참여 중인 선수만 표시됩니다. 한 선수는 여러 포지션에서 서로 다른 점수를 가질 수 있습니다.</p>
              </div>
              <div className="score-rule">
                팀 제한 점수 <strong>{MAX_SCORE}</strong>
              </div>
            </div>

            <div className="position-tabs">
              {POSITION_ORDER.map((pos) => (
                <button
                  key={pos}
                  className={position === pos ? 'active' : ''}
                  onClick={() => setPosition(pos)}
                >
                  {POSITION_LABELS[pos]}
                  <span>
                    {players.filter(
                      (p) =>
                        p.active !== false && p.positions?.[pos] !== undefined,
                    ).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="player-table">
              <div className="table-head">
                <span>이름</span>
                <span>게임 닉네임</span>
                <span>점수</span>
              </div>

              {playersForPosition
                .slice()
                .sort((a, b) => b.positions[position] - a.positions[position])
                .map((player) => (
                  <div className="table-row" key={player.id}>
                    <span className="player-name">{player.name}</span>
                    <a href={opggUrl(player)} target="_blank" rel="noreferrer">
                      {player.nickname}#{player.tag}
                      <span className="external">↗</span>
                    </a>
                    <strong className="score-badge">
                      {player.positions[position]}
                    </strong>
                  </div>
                ))}
            </div>
          </section>
        )}

        {page === 'builder' && (
          <section>
            <div className="page-heading">
              <div>
                <span className="eyebrow">TEAM BUILDER</span>
                <h2>팀 구성해보기</h2>
                <p>각 포지션에서 1명씩 선택하세요. 121점까지 허용됩니다.</p>
              </div>
            </div>

            <div className="builder-layout">
              <div className="builder-panel">
                <div className="builder-slots">
                  {POSITION_ORDER.map((pos) => {
                    const player = getPlayer(selected[pos])

                    return (
                      <div className="builder-slot" key={pos}>
                        <div className="slot-position">{POSITION_LABELS[pos]}</div>

                        <select
                          value={selected[pos] ?? ''}
                          onChange={(e) => choosePlayer(pos, e.target.value)}
                        >
                          <option value="">선수를 선택하세요</option>
                          {players
                            .filter(
                              (p) =>
                                p.active !== false &&
                                p.positions?.[pos] !== undefined,
                            )
                            .sort((a, b) => b.positions[pos] - a.positions[pos])
                            .map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name} · {p.nickname} · {p.positions[pos]}점
                              </option>
                            ))}
                        </select>

                        <span className="slot-score">
                          {player?.positions?.[pos] ?? 0}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <button
                  className="secondary-button"
                  onClick={() => setSelected({})}
                >
                  다시 구성하기
                </button>
              </div>

              <aside className={`score-card ${currentScore > MAX_SCORE ? 'over' : ''}`}>
                <span>현재 팀 점수</span>

                <div className="big-score">
                  {currentScore}<small> / {MAX_SCORE}</small>
                </div>

                {currentScore > MAX_SCORE ? (
                  <div className="score-warning">
                    ⚠ 기준 점수를 초과했습니다.
                  </div>
                ) : (
                  <div className="score-ok">
                    {selectedComplete
                      ? '✓ 팀 구성 가능'
                      : '포지션을 모두 선택해주세요'}
                  </div>
                )}

                <div className="score-bar">
                  <div
                    style={{
                      width: `${Math.min(
                        (currentScore / MAX_SCORE) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </aside>
            </div>
          </section>
        )}

        {page === 'teams' && (
          <section>
            <div className="page-heading">
              <div>
                <span className="eyebrow">TEAMS & RECORDS</span>
                <h2>팀 기록</h2>
                <p>지금까지의 팀과 경기 기록을 확인할 수 있습니다.</p>
              </div>
            </div>

            <div className="record-highlights">
              <article className="highlight-card streak-highlight">
                <span className="highlight-label">🏆 최대 승수</span>

                {topWinTeams.map(({ team, stats }) => (
                  <div className="streak-team" key={team.id}>
                    <div className="highlight-team-name">
                      {team.name}
                    </div>

                    <strong>{stats.wins}승</strong>

                    <div className="highlight-roster">
                      {POSITION_ORDER.map((position) => {
                        const player = getPlayer(team.players[position])

                        return (
                          <span key={position}>
                            {player?.name ?? '-'}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </article>

              <article className="highlight-card top-player-highlight">
                <span className="highlight-label">🔥 경기 참여 TOP 3</span>

                <div className="top-player-list">
                  {topPlayers.map(({ player, count }, index) => (
                    <div className="top-player-row" key={player.id}>
                      <span className="rank">{index + 1}</span>
                      <span className="player-name">{player.name}</span>
                      <span className="player-nick">{player.nickname}</span>
                      <strong>{count}경기</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <h3 className="section-title">🟢 생존 팀</h3>
            <div className="team-grid">
              {teams
                .filter((team) => team.alive)
                .map((team) => (
                  <TeamCard key={team.id} team={team} />
                ))}
            </div>

            <h3 className="section-title dead-title">🔴 해체된 팀</h3>
            <div className="team-grid">
              {teams
                .filter((team) => !team.alive)
                .map((team) => (
                  <TeamCard key={team.id} team={team} />
                ))}
            </div>
          </section>
        )}
      </main>

    </div>
  )
}

export default App

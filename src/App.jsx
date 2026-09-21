import { useEffect, useMemo, useState } from 'react'
import {
  MAX_SCORE,
  POSITION_LABELS,
  POSITION_ORDER,
} from './data'
import { supabase, supabaseConfigured } from './supabase'

function getPlayer(players, playerId) {
  return players.find((player) => player.id === playerId)
}

function getScore(players, team) {
  return POSITION_ORDER.reduce((sum, position) => {
    const player = getPlayer(players, team.players?.[position])
    return sum + (player?.positions?.[position] ?? 0)
  }, 0)
}

function opggUrl(player) {
  return `https://op.gg/lol/summoners/kr/${encodeURIComponent(player.nickname)}-${encodeURIComponent(player.tag)}`
}

function getTeamStats(teamId, teams, matches) {
  const teamMatches = matches.filter(
    (match) => match.team_a === teamId || match.team_b === teamId,
  )

  let wins = 0
  for (const match of teamMatches) {
    const isA = match.team_a === teamId
    const ownScore = isA ? match.score_a : match.score_b
    const opponentScore = isA ? match.score_b : match.score_a
    if (ownScore > opponentScore) wins += 1
  }

  const sorted = [...teamMatches].sort((a, b) => b.date.localeCompare(a.date))
  return {
    wins,
    matches: teamMatches,
    lastMatchDate: sorted[0]?.date ?? null,
  }
}

function getMatchNumber(match, teamId, matches) {
  const teamMatches = matches
    .filter((item) => item.team_a === teamId || item.team_b === teamId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const index = teamMatches.findIndex((item) => item.id === match.id)
  return index >= 0 ? index + 1 : null
}

function daysSince(dateString) {
  if (!dateString) return null
  const lastDate = new Date(`${dateString}T00:00:00`)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.floor((todayStart - lastDate) / 86400000))
}

function getTopWinTeams(teams, matches) {
  const teamStats = teams.map((team) => ({
    team,
    stats: getTeamStats(team.id, teams, matches),
  }))
  if (!teamStats.length) return []
  const maxWins = Math.max(...teamStats.map(({ stats }) => stats.wins))
  return teamStats
    .filter(({ stats }) => stats.wins === maxWins)
    .sort((a, b) => (b.stats.lastMatchDate ?? '').localeCompare(a.stats.lastMatchDate ?? ''))
}

function getTopPlayersByAppearances(players, teams, matches) {
  const counts = new Map()
  for (const match of matches) {
    for (const teamId of [match.team_a, match.team_b]) {
      const team = teams.find((item) => item.id === teamId)
      if (!team) continue
      for (const position of POSITION_ORDER) {
        const playerId = team.players?.[position]
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .map(([playerId, count]) => ({ player: getPlayer(players, playerId), count }))
    .filter((item) => item.player)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

function TeamCard({ team, players, teams, matches }) {
  const stats = getTeamStats(team.id, teams, matches)
  const score = getScore(players, team)
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
        <div className="team-total"><strong>{score}</strong><span>점</span></div>
      </div>

      <div className="team-roster">
        {POSITION_ORDER.map((position) => {
          const player = getPlayer(players, team.players?.[position])
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
        ) : stats.matches.slice().sort((a, b) => b.date.localeCompare(a.date)).map((match) => {
          const isA = match.team_a === team.id
          const opponentId = isA ? match.team_b : match.team_a
          const ownScore = isA ? match.score_a : match.score_b
          const opponentScore = isA ? match.score_b : match.score_a
          const opponent = teams.find((item) => item.id === opponentId)
          const won = ownScore > opponentScore
          return (
            <div className="match-row" key={match.id}>
              <span className="match-date">{match.date}</span>
              <span>vs {opponent?.name ?? opponentId}</span>
              <span className="match-detail-links">
                {[match.detail_url_1, match.detail_url_2, match.detail_url_3, match.detail_url_4, match.detail_url_5].slice(0, Math.min(5, Math.max(1, (Number(ownScore) || 0) + (Number(opponentScore) || 0)))).map((url, index) => url ? (
                  <a key={index} className="match-detail-link" href={url} target="_blank" rel="noreferrer">{index + 1}경기 ↗</a>
                ) : (
                  <span key={index} className="match-detail-empty">{index + 1}경기</span>
                ))}
              </span>
              <strong className={won ? 'win' : 'loss'}>{ownScore} : {opponentScore} {won ? '승' : '패'}</strong>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function AdminPage({ players, teams, matches, refresh, session }) {
  const [tab, setTab] = useState('players')
  const [message, setMessage] = useState('')
  const emptyPlayerForm = () => ({ id: null, name: '', nickname: '', tag: 'KR1', top: '', jungle: '', mid: '', adc: '', support: '' })
  const [playerForm, setPlayerForm] = useState(emptyPlayerForm())
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [playerListTab, setPlayerListTab] = useState('active')
  const [playerSearch, setPlayerSearch] = useState('')
  const [teamForm, setTeamForm] = useState({ name: '', top: '', jungle: '', mid: '', adc: '', support: '' })
  const today = new Date().toISOString().slice(0, 10)
  const [matchForm, setMatchForm] = useState({ date: today, teamA: '', teamB: '', scoreA: 2, scoreB: 1, detailUrl1: '', detailUrl2: '', detailUrl3: '', detailUrl4: '', detailUrl5: '' })
  const [editingMatchId, setEditingMatchId] = useState(null)
  const [editingMatchOriginal, setEditingMatchOriginal] = useState(null)

  const activePlayers = players.filter((p) => p.active !== false)
  const inactivePlayers = players.filter((p) => p.active === false)
  const displayedPlayers = (playerListTab === 'active' ? activePlayers : inactivePlayers)
    .filter((p) => p.name.toLowerCase().includes(playerSearch.trim().toLowerCase()))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const teamsByNewest = teams.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const matchesByNewest = matches.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const matchTeamOptions = teams.filter((t) => t.alive || t.id === matchForm.teamA || t.id === matchForm.teamB)

  async function savePlayer(e) {
    e.preventDefault()
    const positions = Object.fromEntries(POSITION_ORDER.filter((p) => playerForm[p] !== '').map((p) => [p, Number(playerForm[p])]))
    if (!playerForm.name || !playerForm.nickname || !playerForm.tag) return setMessage('이름, 게임 닉네임, 태그를 입력하세요.')
    if (!Object.keys(positions).length) return setMessage('포지션 점수를 하나 이상 입력하세요.')
    const payload = { name: playerForm.name, nickname: playerForm.nickname, tag: playerForm.tag, positions }
    const query = editingPlayerId
      ? supabase.from('players').update(payload).eq('id', editingPlayerId)
      : supabase.from('players').insert({ id: `p${Date.now()}`, active: true, ...payload })
    const { error } = await query
    setMessage(error ? error.message : (editingPlayerId ? '선수 정보를 수정했습니다.' : '선수를 추가했습니다.'))
    if (!error) {
      setPlayerForm(emptyPlayerForm())
      setEditingPlayerId(null)
      refresh()
    }
  }

  function editPlayer(player) {
    setEditingPlayerId(player.id)
    setPlayerForm({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      ...Object.fromEntries(POSITION_ORDER.map((p) => [p, player.positions?.[p] ?? ''])),
    })
  }

  function cancelPlayerEdit() {
    setEditingPlayerId(null)
    setPlayerForm(emptyPlayerForm())
  }

  async function togglePlayer(player) {
    const { error } = await supabase.from('players').update({ active: !player.active }).eq('id', player.id)
    setMessage(error ? error.message : `${player.name} 상태를 변경했습니다.`)
    if (!error) refresh()
  }

  async function addTeam(e) {
    e.preventDefault()
    if (!teamForm.name || POSITION_ORDER.some((p) => !teamForm[p])) return setMessage('팀 이름과 5개 포지션을 모두 선택하세요.')
    const playersMap = Object.fromEntries(POSITION_ORDER.map((p) => [p, teamForm[p]]))
    const score = getScore(players, { players: playersMap })
    if (score > MAX_SCORE) return setMessage(`팀 점수가 ${score}점입니다. ${MAX_SCORE}점을 초과했습니다.`)
    const { error } = await supabase.from('teams').insert({ id: `team${Date.now()}`, name: teamForm.name, alive: true, players: playersMap })
    setMessage(error ? error.message : '팀을 추가했습니다.')
    if (!error) {
      setTeamForm({ name: '', top: '', jungle: '', mid: '', adc: '', support: '' })
      refresh()
    }
  }

  async function deleteTeam(team) {
    if (!window.confirm(`'${team.name}' 팀을 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return
    const { error } = await supabase.from('teams').delete().eq('id', team.id)
    setMessage(error ? error.message : `'${team.name}' 팀을 삭제했습니다.`)
    if (!error) refresh()
  }

  function editMatch(match) {
    setEditingMatchId(match.id)
    setEditingMatchOriginal(match)
    setMatchForm({
      date: match.date,
      teamA: match.team_a,
      teamB: match.team_b,
      scoreA: match.score_a,
      scoreB: match.score_b,
      detailUrl1: match.detail_url_1 ?? '',
      detailUrl2: match.detail_url_2 ?? '',
      detailUrl3: match.detail_url_3 ?? '',
      detailUrl4: match.detail_url_4 ?? '',
      detailUrl5: match.detail_url_5 ?? '',
    })
  }

  function cancelMatchEdit() {
    setEditingMatchId(null)
    setEditingMatchOriginal(null)
    setMatchForm({ date: new Date().toISOString().slice(0, 10), teamA: '', teamB: '', scoreA: 2, scoreB: 1, detailUrl1: '', detailUrl2: '', detailUrl3: '', detailUrl4: '', detailUrl5: '' })
  }

  async function saveMatch(e) {
    e.preventDefault()
    if (!matchForm.teamA || !matchForm.teamB || matchForm.teamA === matchForm.teamB) return setMessage('서로 다른 두 팀을 선택하세요.')
    if (!matchForm.date || matchForm.date > new Date().toISOString().slice(0, 10)) return setMessage('미래 날짜의 경기는 등록할 수 없습니다.')
    if (Number(matchForm.scoreA) === Number(matchForm.scoreB)) return setMessage('무승부는 입력할 수 없습니다.')
    if (Number(matchForm.scoreA) > 3 || Number(matchForm.scoreB) > 3 || Number(matchForm.scoreA) < 0 || Number(matchForm.scoreB) < 0) return setMessage('경기 점수는 0~3 사이로 입력하세요.')
    const scoreA = Number(matchForm.scoreA)
    const scoreB = Number(matchForm.scoreB)
    const payload = {
      date: matchForm.date,
      team_a: matchForm.teamA,
      team_b: matchForm.teamB,
      score_a: scoreA,
      score_b: scoreB,
      detail_url_1: matchForm.detailUrl1.trim() || null,
      detail_url_2: matchForm.detailUrl2.trim() || null,
      detail_url_3: matchForm.detailUrl3.trim() || null,
      detail_url_4: matchForm.detailUrl4.trim() || null,
      detail_url_5: matchForm.detailUrl5.trim() || null,
    }
    const query = editingMatchId
      ? supabase.from('matches').update(payload).eq('id', editingMatchId)
      : supabase.from('matches').insert({ id: `m${Date.now()}`, ...payload })
    const { error } = await query
    if (error) return setMessage(error.message)

    const newLoserId = scoreA > scoreB ? matchForm.teamB : matchForm.teamA
    let teamError = null
    if (editingMatchOriginal) {
      const oldScoreA = Number(editingMatchOriginal.score_a)
      const oldScoreB = Number(editingMatchOriginal.score_b)
      const oldLoserId = oldScoreA > oldScoreB ? editingMatchOriginal.team_b : editingMatchOriginal.team_a
      if (oldLoserId && oldLoserId !== newLoserId) {
        const revert = await supabase.from('teams').update({ alive: true }).eq('id', oldLoserId)
        teamError = revert.error
      }
    }
    if (!teamError) {
      const lose = await supabase.from('teams').update({ alive: false }).eq('id', newLoserId)
      teamError = lose.error
    }
    setMessage(teamError ? teamError.message : (editingMatchId ? '경기 정보를 수정했습니다.' : '경기를 등록했습니다. 패배 팀은 자동으로 해체 처리했습니다.'))
    if (!teamError) {
      cancelMatchEdit()
      refresh()
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMIN</span>
          <h2>관리</h2>
          <p>{session.user.email} · 관리자만 데이터를 변경할 수 있습니다.</p>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="admin-tabs">
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>선수</button>
        <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>팀</button>
        <button className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}>경기</button>
      </div>

      {tab === 'players' && (
        <div className="admin-grid">
          <form className="admin-card" onSubmit={savePlayer}>
            <h3>{editingPlayerId ? '선수 수정' : '선수 추가'}</h3>
            <input placeholder="이름" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} required />
            <input placeholder="게임 닉네임" value={playerForm.nickname} onChange={(e) => setPlayerForm({ ...playerForm, nickname: e.target.value })} required />
            <input placeholder="태그 (예: KR1)" value={playerForm.tag} onChange={(e) => setPlayerForm({ ...playerForm, tag: e.target.value })} required />
            <div className="score-input-grid">
              {POSITION_ORDER.map((p) => <label key={p}>{POSITION_LABELS[p]}<input type="number" min="0" value={playerForm[p]} onChange={(e) => setPlayerForm({ ...playerForm, [p]: e.target.value })} /></label>)}
            </div>
            <div className="button-row">
              <button className="primary-button" type="submit">{editingPlayerId ? '수정 저장' : '선수 추가'}</button>
              {editingPlayerId && <button className="secondary-button" type="button" onClick={cancelPlayerEdit}>취소</button>}
            </div>
          </form>

          <div className="admin-card">
            <h3>현재 선수</h3>
            <div className="player-list-tabs">
              <button type="button" className={playerListTab === 'active' ? 'active' : ''} onClick={() => setPlayerListTab('active')}>활동중<span>{activePlayers.length}</span></button>
              <button type="button" className={playerListTab === 'inactive' ? 'active' : ''} onClick={() => setPlayerListTab('inactive')}>탈퇴<span>{inactivePlayers.length}</span></button>
            </div>
            <input className="player-search-input" type="text" placeholder="이름으로 검색" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} />
            <div className="admin-list">
              {displayedPlayers.length === 0 && <div className="empty-small">표시할 선수가 없습니다.</div>}
              {displayedPlayers.map((player) => (
                <div className={`admin-list-row clickable ${editingPlayerId === player.id ? 'selected' : ''}`} key={player.id} onClick={() => editPlayer(player)}>
                  <div className="player-admin-main">
                    <strong>{player.name}</strong>
                    <span>{player.nickname}#{player.tag} · {player.active ? '활동' : '탈퇴'}</span>
                    <div className="player-admin-scores">
                      {POSITION_ORDER.filter((p) => player.positions?.[p] !== undefined).map((p) => <span key={p}>{POSITION_LABELS[p]} {player.positions[p]}점</span>)}
                    </div>
                  </div>
                  <button className="secondary-button" onClick={(e) => { e.stopPropagation(); togglePlayer(player) }}>{player.active ? '탈퇴 처리' : '복귀 처리'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'teams' && (
        <div className="admin-grid">
          <form className="admin-card" onSubmit={addTeam}>
            <h3>팀 추가</h3>
            <input placeholder="팀 이름" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required />
            {POSITION_ORDER.map((p) => (
              <label className="admin-field" key={p}>{POSITION_LABELS[p]}
                <select value={teamForm[p]} onChange={(e) => setTeamForm({ ...teamForm, [p]: e.target.value })}>
                  <option value="">선택</option>
                  {activePlayers.filter((x) => x.positions?.[p] !== undefined).sort((a, b) => b.positions[p] - a.positions[p]).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.positions[p]}점</option>)}
                </select>
              </label>
            ))}
            <button className="primary-button" type="submit">팀 추가</button>
          </form>

          <div className="admin-card">
            <h3>팀 현황</h3>
            <div className="admin-list">
              {teamsByNewest.length === 0 && <div className="empty-small">등록된 팀이 없습니다.</div>}
              {teamsByNewest.map((team) => (
                <div className="admin-list-row" key={team.id}>
                  <div className="player-admin-main team-admin-main">
                    <strong>{team.name}</strong>
                    <span>{team.alive ? '생존' : '해체'} · {getScore(players, team)}점</span>
                    <div className="player-admin-scores">
                      {POSITION_ORDER.map((p) => <span key={p}>{POSITION_LABELS[p]} {getPlayer(players, team.players?.[p])?.name ?? '-'}</span>)}
                    </div>
                  </div>
                  <button className="secondary-button" onClick={() => deleteTeam(team)}>삭제</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'matches' && (
        <div className="admin-grid">
          <form className="admin-card" onSubmit={saveMatch}>
            <h3>{editingMatchId ? '경기 결과 수정' : '경기 결과 추가'}</h3>
            <label className="admin-field">날짜<input type="date" max={today} value={matchForm.date} onChange={(e) => setMatchForm({ ...matchForm, date: e.target.value })} /></label>
            <label className="admin-field">팀 A<select value={matchForm.teamA} onChange={(e) => setMatchForm({ ...matchForm, teamA: e.target.value })}><option value="">선택</option>{matchTeamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}{!t.alive ? ' (해체)' : ''}</option>)}</select></label>
            <label className="admin-field">팀 B<select value={matchForm.teamB} onChange={(e) => setMatchForm({ ...matchForm, teamB: e.target.value })}><option value="">선택</option>{matchTeamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}{!t.alive ? ' (해체)' : ''}</option>)}</select></label>
            <div className="score-input-grid two"><label>팀 A 점수<input type="number" min="0" value={matchForm.scoreA} onChange={(e) => setMatchForm({ ...matchForm, scoreA: e.target.value })} /></label><label>팀 B 점수<input type="number" min="0" value={matchForm.scoreB} onChange={(e) => setMatchForm({ ...matchForm, scoreB: e.target.value })} /></label></div>
            <div className="match-url-grid">
              {[1, 2, 3, 4, 5].map((n) => <label className="admin-field" key={n}>{n}경기 상세 URL <span className="field-hint">선택사항</span><input type="url" placeholder="https://..." value={matchForm[`detailUrl${n}`]} onChange={(e) => setMatchForm({ ...matchForm, [`detailUrl${n}`]: e.target.value })} /></label>)}
            </div>
            <div className="button-row">
              <button className="primary-button" type="submit">{editingMatchId ? '수정 저장' : '경기 등록'}</button>
              {editingMatchId && <button className="secondary-button" type="button" onClick={cancelMatchEdit}>취소</button>}
            </div>
          </form>

          <div className="admin-card">
            <h3>경기 현황</h3>
            <div className="admin-list">
              {matchesByNewest.length === 0 && <div className="empty-small">등록된 경기가 없습니다.</div>}
              {matchesByNewest.map((match) => (
                <div className={`admin-list-row clickable ${editingMatchId === match.id ? 'selected' : ''}`} key={match.id} onClick={() => editMatch(match)}>
                  <div className="player-admin-main match-admin-main">
                    <strong>{match.date}</strong>
                    <span>{teams.find((t) => t.id === match.team_a)?.name ?? match.team_a} vs {teams.find((t) => t.id === match.team_b)?.name ?? match.team_b}</span>
                    <div className="player-admin-scores">
                      <span>{match.score_a} : {match.score_b}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('로그인에 실패했습니다. 이메일/비밀번호를 확인하세요.')
    else onLogin()
  }
  return (
    <section className="login-card">
      <span className="eyebrow">ADMIN LOGIN</span>
      <h2>관리자 로그인</h2>
      <p>관리자 계정으로 로그인하면 선수, 팀, 경기 데이터를 수정할 수 있습니다.</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit">로그인</button>
      </form>
    </section>
  )
}

function App() {
  const [page, setPage] = useState('players')
  const [position, setPosition] = useState('top')
  const [selected, setSelected] = useState({})
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  async function refresh() {
    setLoading(true)
    const [playersRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from('players').select('*').order('created_at'),
      supabase.from('teams').select('*').order('created_at'),
      supabase.from('matches').select('*').order('date'),
    ])
    const firstError = playersRes.error || teamsRes.error || matchesRes.error
    if (firstError) setError(firstError.message)
    else {
      setPlayers(playersRes.data ?? [])
      setTeams(teamsRes.data ?? [])
      setMatches(matchesRes.data ?? [])
      setError('')
    }
    setLoading(false)
  }

  async function checkAdmin(currentSession) {
    if (!currentSession) return setIsAdmin(false)
    const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', currentSession.user.id).maybeSingle()
    setIsAdmin(Boolean(data))
  }

  useEffect(() => {
    if (!supabaseConfigured) return
    refresh()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      checkAdmin(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      checkAdmin(currentSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const currentScore = useMemo(() => POSITION_ORDER.reduce((sum, pos) => sum + (getPlayer(players, selected[pos])?.positions?.[pos] ?? 0), 0), [selected, players])
  const selectedComplete = POSITION_ORDER.every((pos) => selected[pos])
  const playersForPosition = players.filter((player) => player.active !== false && player.positions?.[position] !== undefined)
  const topWinTeams = useMemo(() => getTopWinTeams(teams, matches), [teams, matches])
  const topPlayers = useMemo(() => getTopPlayersByAppearances(players, teams, matches), [players, teams, matches])

  function choosePlayer(pos, playerId) {
    setSelected((prev) => ({ ...prev, [pos]: playerId }))
  }

  if (!supabaseConfigured) {
    return <div className="app"><main className="container"><div className="login-card"><span className="eyebrow">SETUP REQUIRED</span><h2>Supabase 연결이 필요합니다.</h2><p>프로젝트 루트에 <code>.env.local</code>을 만들고 Supabase URL과 Publishable Key를 넣어주세요.</p><pre>VITE_SUPABASE_URL=...{`\n`}VITE_SUPABASE_PUBLISHABLE_KEY=...</pre></div></main></div>
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">롤</div><div><h1>롤러가자 격전</h1></div></div>
        <div className="nav-actions">
          <nav className="main-nav">
            <button className={page === 'players' ? 'active' : ''} onClick={() => setPage('players')}>선수 명단</button>
            <button className={page === 'builder' ? 'active' : ''} onClick={() => setPage('builder')}>팀 만들기</button>
            <button className={page === 'teams' ? 'active' : ''} onClick={() => setPage('teams')}>팀 기록</button>
            <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>관리</button>
          </nav>
          {isAdmin && <button className="logout-button" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
        </div>
      </header>

      <main className="container">
        {loading && <div className="notice">데이터를 불러오는 중입니다...</div>}
        {error && <div className="notice">데이터를 불러오지 못했습니다: {error}</div>}

        {page === 'players' && !loading && (
          <section>
            <div className="page-heading"><div><span className="eyebrow">PLAYERS</span><h2>포지션별 선수 명단</h2></div><div className="score-rule">팀 제한 점수 <strong>{MAX_SCORE}</strong></div></div>
            <div className="position-tabs">{POSITION_ORDER.map((pos) => <button key={pos} className={position === pos ? 'active' : ''} onClick={() => setPosition(pos)}>{POSITION_LABELS[pos]}<span>{players.filter((p) => p.active !== false && p.positions?.[pos] !== undefined).length}</span></button>)}</div>
            <div className="player-table"><div className="table-head"><span>이름</span><span>게임 닉네임</span><span>점수</span></div>{playersForPosition.slice().sort((a, b) => b.positions[position] - a.positions[position]).map((player) => <div className="table-row" key={player.id}><span className="player-name">{player.name}</span><a href={opggUrl(player)} target="_blank" rel="noreferrer">{player.nickname}#{player.tag}<span className="external">↗</span></a><strong className="score-badge">{player.positions[position]}</strong></div>)}</div>
          </section>
        )}

        {page === 'builder' && !loading && (
          <section>
            <div className="page-heading"><div><span className="eyebrow">TEAM BUILDER</span><h2>팀 구성해보기</h2><p>각 포지션에서 1명씩 선택하세요. 121점까지 허용됩니다.</p></div></div>
            <div className="builder-layout"><div className="builder-panel"><div className="builder-slots">{POSITION_ORDER.map((pos) => { const player = getPlayer(players, selected[pos]); return <div className="builder-slot" key={pos}><div className="slot-position">{POSITION_LABELS[pos]}</div><select value={selected[pos] ?? ''} onChange={(e) => choosePlayer(pos, e.target.value)}><option value="">선수를 선택하세요</option>{players.filter((p) => p.active !== false && p.positions?.[pos] !== undefined).sort((a, b) => b.positions[pos] - a.positions[pos]).map((p) => <option value={p.id} key={p.id}>{p.name} · {p.nickname} · {p.positions[pos]}점</option>)}</select><span className="slot-score">{player?.positions?.[pos] ?? 0}</span></div> })}</div><button className="secondary-button" onClick={() => setSelected({})}>다시 구성하기</button></div><aside className={`score-card ${currentScore > MAX_SCORE ? 'over' : ''}`}><span>현재 팀 점수</span><div className="big-score">{currentScore}<small> / {MAX_SCORE}</small></div>{currentScore > MAX_SCORE ? <div className="score-warning">⚠ 기준 점수를 초과했습니다.</div> : <div className="score-ok">{selectedComplete ? '✓ 팀 구성 가능' : '포지션을 모두 선택해주세요'}</div>}<div className="score-bar"><div style={{ width: `${Math.min((currentScore / MAX_SCORE) * 100, 100)}%` }} /></div></aside></div>
          </section>
        )}

        {page === 'teams' && !loading && (
          <section>
            <div className="page-heading"><div><span className="eyebrow">TEAMS & RECORDS</span><h2>팀 기록</h2><p>지금까지의 팀과 경기 기록을 확인할 수 있습니다.</p></div></div>
            <div className="record-highlights"><article className="highlight-card streak-highlight"><span className="highlight-label">🏆 최대 승수</span>{topWinTeams.map(({ team, stats }) => <div className="streak-team" key={team.id}><div className="highlight-team-name">{team.name}</div><strong>{stats.wins}승</strong><div className="highlight-roster">{POSITION_ORDER.map((position) => <span key={position}>{getPlayer(players, team.players?.[position])?.name ?? '-'}</span>)}</div></div>)}</article><article className="highlight-card top-player-highlight"><span className="highlight-label">🔥 경기 참여 TOP 3</span><div className="top-player-list">{topPlayers.map(({ player, count }, index) => <div className="top-player-row" key={player.id}><span className="rank">{index + 1}</span><span className="player-name">{player.name}</span><span className="player-nick">{player.nickname}</span><strong>{count}경기</strong></div>)}</div></article></div>
            <h3 className="section-title">🟢 생존 팀</h3><div className="team-grid">{teams.filter((team) => team.alive).map((team) => <TeamCard key={team.id} team={team} players={players} teams={teams} matches={matches} />)}</div>
            <h3 className="section-title dead-title">🔴 해체된 팀</h3><div className="team-grid">{teams.filter((team) => !team.alive).map((team) => <TeamCard key={team.id} team={team} players={players} teams={teams} matches={matches} />)}</div>
          </section>
        )}

        {page === 'admin' && (isAdmin ? <AdminPage players={players} teams={teams} matches={matches} refresh={refresh} session={session} /> : <LoginPage onLogin={() => setPage('admin')} />)}
      </main>

      <footer className="footer"><span>롤러가자 격전</span></footer>
    </div>
  )
}

export default App

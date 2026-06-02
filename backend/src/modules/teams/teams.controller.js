const teamsService = require('./teams.service');

const listTeams = async (req, res) => {
  const teams = await teamsService.listTeams(req.user, req.query);
  res.json({ teams });
};

const createTeam = async (req, res) => {
  const team = await teamsService.saveTeam(req.user, req.body);
  res.status(201).json({ team });
};

const updateTeam = async (req, res) => {
  const team = await teamsService.saveTeam(req.user, req.body, req.params.id);
  res.json({ team });
};

const deleteTeam = async (req, res) => {
  await teamsService.deleteTeam(req.user, req.params.id);
  res.status(204).send();
};

module.exports = {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
};

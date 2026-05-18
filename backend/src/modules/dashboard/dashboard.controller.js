const admin = async (req, res) => {
  res.json({
    stats: {
      huntedToday: 0,
      listedToday: 0,
      accountUsage: [],
      recentActivity: [],
    },
  });
};

const hunter = async (req, res) => {
  res.json({
    stats: {
      submittedToday: 0,
      approvedToday: 0,
      rejectedToday: 0,
    },
  });
};

const lister = async (req, res) => {
  res.json({
    stats: {
      approvedQueue: 0,
      listedToday: 0,
    },
  });
};

module.exports = {
  admin,
  hunter,
  lister,
};

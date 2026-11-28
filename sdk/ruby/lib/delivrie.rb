# frozen_string_literal: true

require_relative "delivrie/version"
require_relative "delivrie/error"
require_relative "delivrie/client"
require_relative "delivrie/resources"
require_relative "delivrie/webhook"

# Delivrie: email for developers and agents. See https://delivrie.io/docs/ruby
module Delivrie
  # Shortcut for Delivrie::Client.new.
  def self.new(*args, **kwargs) = Client.new(*args, **kwargs)
end
